#!/bin/bash

# Install Nginx kalau belum ada
apt-get update && apt-get install -y nginx

# (Opsional) Install acme.sh untuk SSL cert, lalu issue cert:
# curl https://get.acme.sh | sh
# /root/.acme.sh/acme.sh --issue -d zhaffdownloader.web.id --dns dns_cf
# /root/.acme.sh/acme.sh --install-cert -d zhaffdownloader.web.id \
#   --fullchain-file /etc/nginx/ssl/fullchain.pem \
#   --key-file /etc/nginx/ssl/key.pem --reloadcmd "systemctl reload nginx"

mkdir -p /etc/nginx/ssl

# Tulis config Nginx: HTTP (80, 20141) + HTTPS (20142)
cat > /etc/nginx/sites-available/default << 'NGINXCONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 20141 default_server;
    listen [::]:20141 default_server;

    root /var/www/html;
    index index.html;

    server_name zhaffdownloader.web.id www.zhaffdownloader.web.id _;

    location / {
        try_files $uri $uri/ =404;
    }

    location /api/ {
        resolver 1.1.1.1 ipv6=off;
        proxy_pass https://api.jagoanproject.com/api/;
        proxy_ssl_server_name on;
        proxy_set_header Host api.jagoanproject.com;
        proxy_set_header Authorization "Bearer jg_5aX1pnEz6zdGt2iCsliExJlX";
        proxy_set_header X-Real-IP $remote_addr;

        proxy_buffer_size 128k;
        proxy_buffers 8 256k;
        proxy_busy_buffers_size 512k;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;

        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;

        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}

server {
    listen 20142 ssl default_server;
    listen [::]:20142 ssl default_server;

    root /var/www/html;
    index index.html;

    server_name zhaffdownloader.web.id www.zhaffdownloader.web.id _;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        try_files $uri $uri/ =404;
    }

    location /api/ {
        resolver 1.1.1.1 ipv6=off;
        proxy_pass https://api.jagoanproject.com/api/;
        proxy_ssl_server_name on;
        proxy_set_header Host api.jagoanproject.com;
        proxy_set_header Authorization "Bearer jg_5aX1pnEz6zdGt2iCsliExJlX";
        proxy_set_header X-Real-IP $remote_addr;

        proxy_buffer_size 128k;
        proxy_buffers 8 256k;
        proxy_busy_buffers_size 512k;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;

        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;

        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}
NGINXCONF

# Test dan restart Nginx
nginx -t && systemctl restart nginx

echo "Done! Proxy siap. Pastikan DNS A record zhaffdownloader.web.id -> IP server sudah diset (Cloudflare: DNS only, bukan proxied, karena port 20142 tidak didukung Cloudflare proxy)."


