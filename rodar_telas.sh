#!/bin/bash
# Recria o banco de teste, sobe o PostgREST e roda o teste de telas
pkill -x postgrest; sleep 1
P="psql -h /tmp -p 5499 -U postgres -q"
$P -c "drop database if exists app" -c "create database app" >/dev/null
$P -d app -v ON_ERROR_STOP=1 -f stub_supabase.sql >/dev/null
$P -d app -v ON_ERROR_STOP=1 -f ../gabinete-digital/supabase/01_esquema.sql >/dev/null
$P -d app -v ON_ERROR_STOP=1 -f ../gabinete-digital/supabase/02_primeiro_acesso.sql >/dev/null
(cd /home/claude/tools && nohup ./postgrest pgrst.conf > pgrst.log 2>&1 &)
sleep 2
timeout 400 python3 teste_telas.py
