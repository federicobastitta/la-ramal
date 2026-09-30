#!/usr/bin/env bash
# Instala o actualiza LA RAMAL en la instancia de AWS (Ubuntu 24.04). Se corre como root:
#   sudo bash /opt/la-ramal/deploy/aws/instalar.sh
# La primera vez: sudo bash -c "git clone https://github.com/federicobastitta/la-ramal /opt/la-ramal && bash /opt/la-ramal/deploy/aws/instalar.sh"
# Etapa 1: publica la app del chofer y el panel (modo demo, sin Firebase) en el puerto 80 con nginx.
set -euo pipefail
export HOME=/root DEBIAN_FRONTEND=noninteractive
REPO=/opt/la-ramal
WEB=/var/www/la-ramal

echo "== Espacio en disco"; df -h / | tail -1

if ! command -v nginx >/dev/null; then apt-get update -q && apt-get install -yq nginx; fi
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -yq nodejs
fi

git config --global --add safe.directory "$REPO"
git -C "$REPO" fetch -q origin main && git -C "$REPO" reset -q --hard origin/main
cd "$REPO"
npm ci --no-audit --no-fund
BASE_PATH=/ npm run build -w @la-ramal/web

# Se publica en una carpeta nueva y se cambia de golpe (nunca queda a medio copiar).
NUEVA="$WEB-$(date +%Y%m%d%H%M%S)"
cp -r apps/web/dist "$NUEVA"
ln -sfn "$NUEVA" "$WEB"

cat > /etc/nginx/sites-available/la-ramal <<'NGINX'
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;
  root /var/www/la-ramal;
  index index.html;
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml application/manifest+json;
  # Los archivos con hash no cambian nunca; el HTML y el service worker, siempre frescos.
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }
  location = /sw.js { add_header Cache-Control "no-cache"; try_files $uri =404; }
  location / { add_header Cache-Control "no-cache"; try_files $uri $uri/ /index.html; }
}
NGINX
ln -sfn /etc/nginx/sites-available/la-ramal /etc/nginx/sites-enabled/la-ramal
[ -e /etc/nginx/sites-enabled/default ] && mv /etc/nginx/sites-enabled/default /root/nginx-default-sitio-viejo.conf || true
nginx -t && systemctl enable --now nginx && systemctl reload nginx

echo "== Instalado: $(git -C "$REPO" log --oneline -1)"
curl -s -o /dev/null -w "app del chofer: %{http_code}\n" http://127.0.0.1/
curl -s -o /dev/null -w "panel: %{http_code}\n" http://127.0.0.1/panel.html
