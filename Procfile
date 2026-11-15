web: cd backend && python manage.py collectstatic --noinput && gunicorn agrivision.wsgi:application --bind 0.0.0.0:$PORT --timeout 120 --workers 1
