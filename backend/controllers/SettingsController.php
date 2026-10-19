<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

// Company details printed on invoices and shown in the app header.
class SettingsController
{
    private const FIELDS = ['company_name', 'building_no', 'street', 'city', 'district', 'state', 'pincode', 'phone', 'email', 'gstin', 'barcode_prefix'];
    private const GSTIN = '/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/';

    public static function show(): void
    {
        ok(self::all());
    }

    public static function update(): void
    {
        $in = input();
        $d = [];
        foreach (self::FIELDS as $f) $d[$f] = trim((string)($in[$f] ?? ''));
        $d['gstin'] = strtoupper($d['gstin']);
        $d['barcode_prefix'] = strtoupper($d['barcode_prefix']);

        $errors = [];
        if ($d['company_name'] === '') $errors['company_name'] = 'Company name is required';
        if ($d['pincode'] !== '' && !preg_match('/^[0-9]{6}$/', $d['pincode'])) $errors['pincode'] = 'PIN code must be 6 digits';
        if ($d['phone'] !== '' && !preg_match('/^[0-9+\-\s]{6,20}$/', $d['phone'])) $errors['phone'] = 'Invalid phone number';
        if ($d['email'] !== '' && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Invalid email';
        if ($d['gstin'] !== '' && !preg_match(self::GSTIN, $d['gstin'])) $errors['gstin'] = 'Invalid GSTIN (15 characters, e.g. 33ABCDE1234F1Z5)';
        if (!preg_match('/^[A-Z0-9]{0,6}$/', $d['barcode_prefix'])) $errors['barcode_prefix'] = 'Barcode prefix: up to 6 letters/digits';
        if ($errors) fail(implode('. ', $errors), 422, $errors);

        $s = db()->prepare('INSERT INTO settings (skey, svalue) VALUES (?, ?) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)');
        foreach ($d as $k => $v) $s->execute([$k, $v]);
        ok(self::all(), 'Company details saved');
    }

    private static function all(): array
    {
        $rows = db()->query('SELECT skey, svalue FROM settings')->fetchAll(PDO::FETCH_KEY_PAIR);
        $out = [];
        foreach (self::FIELDS as $f) $out[$f] = $rows[$f] ?? '';
        if ($out['company_name'] === '') $out['company_name'] = 'Textile Inventory';
        return $out;
    }
}
