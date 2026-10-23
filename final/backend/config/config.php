<?php
// Application configuration. Change these values for your environment.
return [
    'db' => [
        'host'    => '127.0.0.1',
        'name'    => 'textile_inventory',
        'user'    => 'root',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],
    'jwt_secret'  => 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET',
    'jwt_ttl'     => 60 * 60 * 8, // 8 hours
    'cors_origin' => 'http://localhost:5173', // React dev server
];
