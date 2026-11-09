<?php
$url = isset($_GET['url']) ? $_GET['url'] : '';
$filename = isset($_GET['filename']) ? $_GET['filename'] : 'video.mp4';

if (empty($url)) {
    http_response_code(400);
    echo json_encode(['error' => 'URL required']);
    exit;
}

// Sanitize filename
$filename = preg_replace('/[^a-zA-Z0-9._\- ]/', '_', $filename);
$filename = trim($filename) ?: 'video.mp4';

// Follow redirects and stream file
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 10,
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_HEADER => false,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_TIMEOUT => 0,
    CURLOPT_BUFFERSIZE => 128000,
    CURLOPT_HEADERFUNCTION => function($ch, $header) {
        $len = strlen($header);
        $h = explode(':', $header, 2);
        if (count($h) < 2) return $len;
        $key = strtolower(trim($h[0]));
        if (in_array($key, ['content-type', 'content-length'])) {
            header($header, true);
        }
        return $len;
    },
    CURLOPT_WRITEFUNCTION => function($ch, $data) {
        echo $data;
        if (ob_get_level()) ob_flush();
        flush();
        return strlen($data);
    }
]);

header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Access-Control-Allow-Origin: *');
header('X-Content-Type-Options: nosniff');

curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode >= 400) {
    http_response_code(502);
}
?>
