<?php
// Tanpa batas waktu eksekusi untuk file besar
set_time_limit(0);
ignore_user_abort(true);
ini_set('memory_limit', '256M');

$url      = isset($_GET['url'])      ? trim($_GET['url'])      : '';
$filename = isset($_GET['filename']) ? trim($_GET['filename']) : 'video.mp4';

if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'URL tidak valid']);
    exit;
}

// Sanitize filename
$filename = preg_replace('/[^\w\.\- ]/u', '_', $filename);
$filename = trim($filename) ?: 'video.mp4';

// Resolve redirect dulu tanpa download body
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_NOBODY         => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 10,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
]);
curl_exec($ch);
$finalUrl    = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

$finalUrl = $finalUrl ?: $url;

// Stream file ke browser (tanpa menampung di memori/server)
$ch2 = curl_init($finalUrl);
curl_setopt_array($ch2, [
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_CONNECTTIMEOUT => 20,
    CURLOPT_TIMEOUT        => 0,
    CURLOPT_BUFFERSIZE     => 131072,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    CURLOPT_HTTPHEADER     => ['Accept: */*', 'Accept-Encoding: identity'],
    CURLOPT_HEADERFUNCTION => function($ch, $header) {
        $lower = strtolower($header);
        if (strpos($lower, 'content-length:') === 0) {
            header('Content-Length: ' . trim(substr($header, 15)));
        }
        if (strpos($lower, 'content-type:') === 0) {
            header('Content-Type: ' . trim(substr($header, 13)));
        }
        return strlen($header);
    },
    CURLOPT_WRITEFUNCTION  => function($ch, $data) {
        echo $data;
        if (ob_get_level() > 0) ob_flush();
        flush();
        return strlen($data);
    },
]);

// Set download headers
$safeFilename = rawurlencode($filename);
header('Content-Disposition: attachment; filename="' . $filename . '"; filename*=UTF-8\'\'' . $safeFilename);
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
header('Accept-Ranges: bytes');

if (ob_get_level() > 0) ob_end_clean();

curl_exec($ch2);
$httpCode = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
curl_close($ch2);

if ($httpCode >= 400) {
    http_response_code(502);
}
?>
