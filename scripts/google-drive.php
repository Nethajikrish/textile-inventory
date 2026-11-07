<?php
// Uploads database backups to the Google Drive of the account signed in during setup.
//   Sign in once:  php scripts\google-drive.php setup <client_secret.json> [--no-browser]
//   Upload:        php scripts\google-drive.php upload <backup folder> <database name>
// backup-database.ps1 -GoogleDrive runs the upload after each backup. Nothing is ever deleted from Drive.

// This folder is inside htdocs: refuse to run from a browser.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

const DRIVE_FOLDER = 'TextileBackups';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'; // only files this script created, not the rest of the Drive
const DEFAULT_API = 'https://www.googleapis.com';
const NETWORK_WAIT = 120; // seconds; the network can take a while to come up after logon
const SIGN_IN_WAIT = 300;

class NetworkError extends RuntimeException {}

// Stored per Windows user, outside htdocs, so Apache can never serve the sign-in.
function credentials_path(): string
{
    $base = getenv('LOCALAPPDATA');
    if (!$base) {
        throw new RuntimeException('LOCALAPPDATA is not set.');
    }
    return $base . '\\TextileBackup\\google-drive.json';
}

function http(string $method, string $url, array $headers = [], ?string $body = null): array
{
    $responseHeaders = [];
    $c = curl_init($url);
    curl_setopt_array($c, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 30,
        CURLOPT_TIMEOUT => 300,
        // XAMPP's PHP often has no CA bundle configured; Windows' own certificates work on any client PC.
        CURLOPT_SSL_OPTIONS => CURLSSLOPT_NATIVE_CA,
        CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$responseHeaders) {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) {
                $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
            }
            return strlen($line);
        },
    ]);
    if ($body !== null) {
        curl_setopt($c, CURLOPT_POSTFIELDS, $body);
    }
    $response = curl_exec($c);
    if ($response === false) {
        throw new NetworkError('Could not reach Google: ' . curl_error($c));
    }
    return ['status' => curl_getinfo($c, CURLINFO_HTTP_CODE), 'body' => $response, 'headers' => $responseHeaders];
}

function google_message(array $r): string
{
    $j = json_decode($r['body'], true);
    return $j['error']['message'] ?? $j['error_description'] ?? "HTTP {$r['status']}";
}

function access_token(array $cred): string
{
    $form = http_build_query([
        'client_id' => $cred['client_id'],
        'client_secret' => $cred['client_secret'],
        'refresh_token' => $cred['refresh_token'],
        'grant_type' => 'refresh_token',
    ]);
    $deadline = time() + NETWORK_WAIT;
    while (true) {
        try {
            $r = http('POST', $cred['token_uri'], ['Content-Type: application/x-www-form-urlencoded'], $form);
            break;
        } catch (NetworkError $e) {
            if (time() >= $deadline) {
                throw $e;
            }
            sleep(10);
        }
    }
    $j = json_decode($r['body'], true);
    if (($j['error'] ?? '') === 'invalid_grant') {
        throw new RuntimeException('The Google sign-in has expired or was removed. Run: php scripts\\google-drive.php setup <client_secret.json>');
    }
    if ($r['status'] !== 200 || empty($j['access_token'])) {
        throw new RuntimeException('Google refused the sign-in: ' . google_message($r));
    }
    return $j['access_token'];
}

function api(array $cred, string $token, string $method, string $path, array $query = [], ?array $json = null): array
{
    $url = ($cred['api_base'] ?? DEFAULT_API) . $path . ($query ? '?' . http_build_query($query) : '');
    $r = http($method, $url, ["Authorization: Bearer $token", 'Content-Type: application/json'], $json === null ? null : json_encode($json));
    if ($r['status'] < 200 || $r['status'] >= 300) {
        throw new RuntimeException("Google Drive: " . google_message($r));
    }
    return $r;
}

function find_or_create_folder(array $cred, string $token): string
{
    $r = api($cred, $token, 'GET', '/drive/v3/files', [
        'q' => "name='" . DRIVE_FOLDER . "' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        'fields' => 'files(id)',
    ]);
    $files = json_decode($r['body'], true)['files'] ?? [];
    if ($files) {
        return $files[0]['id'];
    }
    $r = api($cred, $token, 'POST', '/drive/v3/files', ['fields' => 'id'], [
        'name' => DRIVE_FOLDER,
        'mimeType' => 'application/vnd.google-apps.folder',
    ]);
    return json_decode($r['body'], true)['id'];
}

// name => md5 of everything already in the Drive folder.
function list_uploaded(array $cred, string $token, string $folderId): array
{
    $uploaded = [];
    $pageToken = null;
    do {
        $query = ['q' => "'$folderId' in parents and trashed=false", 'fields' => 'nextPageToken,files(name,md5Checksum)', 'pageSize' => 1000];
        if ($pageToken) {
            $query['pageToken'] = $pageToken;
        }
        $j = json_decode(api($cred, $token, 'GET', '/drive/v3/files', $query)['body'], true);
        foreach ($j['files'] ?? [] as $f) {
            $uploaded[$f['name']][] = $f['md5Checksum'] ?? '';
        }
        $pageToken = $j['nextPageToken'] ?? null;
    } while ($pageToken);
    return $uploaded;
}

function upload_file(array $cred, string $token, string $folderId, string $path): void
{
    $name = basename($path);
    $start = api($cred, $token, 'POST', '/upload/drive/v3/files', ['uploadType' => 'resumable'], ['name' => $name, 'parents' => [$folderId]]);
    $session = $start['headers']['location'] ?? '';
    if (!$session) {
        throw new RuntimeException("Google Drive did not accept $name.");
    }
    $r = http('PUT', $session . '&fields=id,md5Checksum', ['Content-Type: application/zip'], file_get_contents($path));
    if ($r['status'] < 200 || $r['status'] >= 300) {
        throw new RuntimeException("Upload of $name failed: " . google_message($r));
    }
    if ((json_decode($r['body'], true)['md5Checksum'] ?? '') !== md5_file($path)) {
        throw new RuntimeException("Upload of $name does not match the local file.");
    }
}

function read_credentials(): array
{
    $path = credentials_path();
    if (!is_file($path)) {
        throw new RuntimeException('Google Drive is not set up on this PC. Run: php scripts\\google-drive.php setup <client_secret.json>');
    }
    return json_decode(file_get_contents($path), true);
}

// Uploads every backup Drive doesn't have yet, so one missed while offline catches up on the next run.
function cmd_upload(string $dir, string $dbName): void
{
    if (!is_dir($dir)) {
        throw new RuntimeException("Backup folder not found: $dir");
    }
    $cred = read_credentials();
    $token = access_token($cred);
    $folderId = find_or_create_folder($cred, $token);
    $uploaded = list_uploaded($cred, $token, $folderId);

    $pattern = '/^' . preg_quote($dbName, '/') . '_\d{4}-\d{2}-\d{2}_\d{4}\.zip$/';
    $count = 0;
    foreach (scandir($dir) as $name) {
        if (!preg_match($pattern, $name)) {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $name;
        if (in_array(md5_file($path), $uploaded[$name] ?? [], true)) {
            continue;
        }
        upload_file($cred, $token, $folderId, $path);
        echo "Uploaded $name to Google Drive\n";
        $count++;
    }
    if ($count === 0) {
        echo "Google Drive is up to date\n";
    }
}

// Signs in through the browser and keeps the refresh token. Google sends the browser back to a port on this PC.
function cmd_setup(string $clientFile, bool $openBrowser): void
{
    if (!is_file($clientFile)) {
        throw new RuntimeException("File not found: $clientFile");
    }
    $client = json_decode(file_get_contents($clientFile), true)['installed'] ?? null;
    if (!$client) {
        throw new RuntimeException('This is not a Desktop app key. In Google Cloud, create an OAuth client of type "Desktop app".');
    }

    $server = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if (!$server) {
        throw new RuntimeException("Could not listen for the Google sign-in: $errstr");
    }
    $redirect = 'http://' . stream_socket_get_name($server, false);
    $state = bin2hex(random_bytes(16));
    $verifier = bin2hex(random_bytes(32));
    $url = $client['auth_uri'] . '?' . http_build_query([
        'client_id' => $client['client_id'],
        'redirect_uri' => $redirect,
        'response_type' => 'code',
        'scope' => DRIVE_SCOPE,
        'access_type' => 'offline',
        'prompt' => 'consent',
        'state' => $state,
        'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
        'code_challenge_method' => 'S256',
    ]);

    echo "Sign in with the Google account that should hold the backups:\n$url\n";
    if ($openBrowser) {
        pclose(popen('start "" "' . $url . '"', 'r'));
    }

    $code = wait_for_code($server, $state);
    fclose($server);

    $r = http('POST', $client['token_uri'], ['Content-Type: application/x-www-form-urlencoded'], http_build_query([
        'client_id' => $client['client_id'],
        'client_secret' => $client['client_secret'],
        'code' => $code,
        'code_verifier' => $verifier,
        'grant_type' => 'authorization_code',
        'redirect_uri' => $redirect,
    ]));
    $j = json_decode($r['body'], true);
    if ($r['status'] !== 200 || empty($j['refresh_token'])) {
        throw new RuntimeException('Google refused the sign-in: ' . google_message($r));
    }

    $cred = [
        'client_id' => $client['client_id'],
        'client_secret' => $client['client_secret'],
        'token_uri' => $client['token_uri'],
        'refresh_token' => $j['refresh_token'],
    ];
    if (isset($client['api_base'])) {
        $cred['api_base'] = $client['api_base'];
    }
    $path = credentials_path();
    if (!is_dir(dirname($path))) {
        mkdir(dirname($path), 0700, true);
    }
    file_put_contents($path, json_encode($cred));

    find_or_create_folder($cred, $j['access_token']);
    echo "Signed in. Backups will go to the Google Drive folder '" . DRIVE_FOLDER . "'.\nYou can now delete $clientFile.\n";
}

function wait_for_code($server, string $state): string
{
    $deadline = time() + SIGN_IN_WAIT;
    while (time() < $deadline) {
        $conn = @stream_socket_accept($server, max(1, $deadline - time()));
        if (!$conn) {
            continue;
        }
        $line = (string) fgets($conn);
        parse_str((string) parse_url(explode(' ', $line)[1] ?? '', PHP_URL_QUERY), $q);
        $ok = hash_equals($state, (string) ($q['state'] ?? ''));
        $message = $ok && isset($q['code']) ? 'Signed in. You can close this window.' : 'Sign-in did not complete.';
        fwrite($conn, "HTTP/1.1 " . ($ok ? '200 OK' : '400 Bad Request') . "\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n$message");
        fclose($conn);
        // Anything else on this PC can reach the port, so a wrong state is ignored rather than ending the wait.
        if (!$ok) {
            continue;
        }
        if (isset($q['error'])) {
            throw new RuntimeException("Google sign-in was not completed: {$q['error']}");
        }
        if (isset($q['code'])) {
            return $q['code'];
        }
    }
    throw new RuntimeException('Timed out waiting for the Google sign-in.');
}

try {
    if (!extension_loaded('curl')) {
        throw new RuntimeException('PHP curl is off. Enable extension=curl in php.ini.');
    }
    $command = $argv[1] ?? '';
    if ($command === 'setup' && isset($argv[2])) {
        cmd_setup($argv[2], !in_array('--no-browser', $argv, true));
    } elseif ($command === 'upload' && isset($argv[2], $argv[3])) {
        cmd_upload($argv[2], $argv[3]);
    } else {
        throw new RuntimeException('Usage: php google-drive.php setup <client_secret.json> [--no-browser] | upload <backup folder> <database name>');
    }
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
