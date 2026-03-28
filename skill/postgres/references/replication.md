# PostgreSQL Replication

## Streaming Replication (Physical)

### Primary Server Setup

```ini
# postgresql.conf
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
wal_keep_size = 1GB
hot_standby = on
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/wal_archive/%f'
```

```
# pg_hba.conf — allow replication connections
host replication replicator 10.0.0.0/24 scram-sha-256
```

```sql
-- Create replication user
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'secure_password';

-- Create replication slot (prevents WAL deletion before standby consumes it)
SELECT * FROM pg_create_physical_replication_slot('replica_1');
```

### Standby Server Setup

```bash
# Stop PostgreSQL on standby
systemctl stop postgresql

# Remove data directory
rm -rf /var/lib/postgresql/14/main/*

# Base backup from primary
# -R creates standby.signal and recovery config
# -X stream: stream WAL during backup
# -S replica_1: use replication slot
pg_basebackup -h primary-host -D /var/lib/postgresql/14/main \
  -U replicator -P -v -R -X stream -S replica_1
```

```ini
# recovery parameters in postgresql.auto.conf (created by pg_basebackup -R):
primary_conninfo = 'host=primary-host port=5432 user=replicator password=secure_password'
primary_slot_name = 'replica_1'
```

### Monitoring Replication

```sql
-- On primary: check replication status
SELECT
  client_addr,
  state,
  sync_state,
  sent_lsn,
  write_lsn,
  flush_lsn,
  replay_lsn,
  pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes
FROM pg_stat_replication;

-- On standby: check replay lag
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;

-- Check replication slots
SELECT
  slot_name,
  slot_type,
  active,
  restart_lsn,
  pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS retained_bytes
FROM pg_replication_slots;
```

---

## Synchronous Replication

```ini
# postgresql.conf on primary
synchronous_commit = on
synchronous_standby_names = 'FIRST 1 (replica_1, replica_2)'
# Waits for 1 standby to confirm before commit

# Options:
# FIRST n (names): Wait for n standbys in priority order
# ANY n (names): Wait for any n standbys
# name: Wait for specific standby
```

```sql
-- Check sync status
SELECT application_name, sync_state, state
FROM pg_stat_replication;
-- sync_state: sync (synchronous), async, potential
```

---

## Logical Replication (Row-level)

### Publisher Setup

```ini
# postgresql.conf
wal_level = logical
max_replication_slots = 10
max_wal_senders = 10
```

```sql
-- Create publication (all tables)
CREATE PUBLICATION my_publication FOR ALL TABLES;

-- Or specific tables
CREATE PUBLICATION my_publication FOR TABLE users, orders;

-- Or tables in schema (PG15+)
CREATE PUBLICATION my_publication FOR TABLES IN SCHEMA public;

-- With row filters (PG15+)
CREATE PUBLICATION active_users FOR TABLE users WHERE (active = true);

-- View publications
SELECT * FROM pg_publication;
SELECT * FROM pg_publication_tables;
```

### Subscriber Setup

```sql
-- Create subscription (creates replication slot on publisher)
CREATE SUBSCRIPTION my_subscription
CONNECTION 'host=publisher-host port=5432 dbname=mydb user=replicator password=pass'
PUBLICATION my_publication;

-- Subscription with options
CREATE SUBSCRIPTION my_subscription
CONNECTION 'host=publisher-host dbname=mydb user=replicator'
PUBLICATION my_publication
WITH (
  copy_data = true,            -- Initial data copy
  create_slot = true,          -- Create replication slot
  enabled = true,              -- Start immediately
  slot_name = 'my_sub_slot',
  synchronous_commit = 'off'   -- Performance vs durability
);

-- View subscriptions
SELECT * FROM pg_subscription;
SELECT * FROM pg_stat_subscription;

-- Manage subscription
ALTER SUBSCRIPTION my_subscription DISABLE;
ALTER SUBSCRIPTION my_subscription ENABLE;
ALTER SUBSCRIPTION my_subscription REFRESH PUBLICATION;
DROP SUBSCRIPTION my_subscription;
```

### Logical Replication Monitoring

```sql
-- On publisher: check replication slots
SELECT
  slot_name,
  plugin,
  slot_type,
  active,
  pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) AS lag_bytes
FROM pg_replication_slots
WHERE slot_type = 'logical';

-- On subscriber: check subscription status
SELECT
  subname,
  pid,
  received_lsn,
  latest_end_lsn,
  last_msg_send_time,
  last_msg_receipt_time,
  latest_end_time
FROM pg_stat_subscription;
```

---

## Cascading Replication

```
Primary → Standby1 → Standby2
```

```ini
# On Standby1 (acts as relay)
hot_standby = on
max_wal_senders = 10
wal_keep_size = 1GB
```

```ini
# Standby2 connects to Standby1 (same setup, different primary_conninfo)
primary_conninfo = 'host=standby1-host user=replicator...'
```

---

## Delayed Replication

```ini
# On standby: postgresql.conf
recovery_min_apply_delay = '4h'
```

Useful for:
- Protection against accidental data deletion
- Rolling back to a specific point in time
- Can promote a delayed standby to recover a dropped table

```sql
-- Check current delay
SELECT now() - pg_last_xact_replay_timestamp() AS current_delay;
```

---

## Failover and Promotion

### Manual Failover

```bash
# On standby server — promote standby to primary
pg_ctl promote -D /var/lib/postgresql/14/main

# Or use SQL
SELECT pg_promote();

# Verify promotion
SELECT pg_is_in_recovery();  -- Should return false
```

### Automatic Failover with pg_auto_failover

```bash
# Install pg_auto_failover
apt-get install pg-auto-failover

# Setup monitor node
pg_autoctl create monitor --hostname monitor-host --pgdata /var/lib/monitor

# Setup primary
pg_autoctl create postgres \
  --hostname primary-host \
  --pgdata /var/lib/postgresql/14/main \
  --monitor postgres://monitor-host/pg_auto_failover

# Setup standby
pg_autoctl create postgres \
  --hostname standby-host \
  --pgdata /var/lib/postgresql/14/main \
  --monitor postgres://monitor-host/pg_auto_failover

# Check status
pg_autoctl show state
```

### Patroni (Production HA Solution)

```yaml
# patroni.yml
scope: postgres-cluster
name: node1

restapi:
  listen: 0.0.0.0:8008
  connect_address: node1:8008

etcd:
  hosts: etcd1:2379,etcd2:2379,etcd3:2379

bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    retry_timeout: 10
    maximum_lag_on_failover: 1048576
    postgresql:
      use_pg_rewind: true
      parameters:
        max_connections: 100
        max_wal_senders: 10
        wal_level: replica

postgresql:
  listen: 0.0.0.0:5432
  connect_address: node1:5432
  data_dir: /var/lib/postgresql/14/main
  authentication:
    replication:
      username: replicator
      password: repl_password
    superuser:
      username: postgres
      password: postgres_password
```

---

## Connection Pooling for HA

### PgBouncer Configuration

```ini
# pgbouncer.ini
[databases]
mydb = host=primary-host port=5432 dbname=mydb

[pgbouncer]
listen_addr = *
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
```

### HAProxy for Load Balancing

```
# haproxy.cfg
frontend postgres_frontend
    bind *:5432
    mode tcp
    default_backend postgres_backend

backend postgres_backend
    mode tcp
    option tcp-check
    tcp-check expect string is_master:true

    server primary  primary-host:5432  check
    server standby1 standby1-host:5432 check backup
    server standby2 standby2-host:5432 check backup
```

---

## Backup and Point-in-Time Recovery (PITR)

### WAL Archiving Setup

```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /backup/wal/%f && cp %p /backup/wal/%f'
archive_timeout = 300  # Force archive every 5 minutes

# Or use pgbackrest:
# archive_command = 'pgbackrest --stanza=main archive-push %p'
```

### Base Backup

```bash
# Full backup
pg_basebackup -h localhost -U postgres \
  -D /backup/base/$(date +%Y%m%d) \
  -Ft -z -P -X fetch
# -Ft: tar format, -z: gzip compression, -P: progress, -X fetch: include WAL
```

### Point-in-Time Recovery

```bash
# Stop PostgreSQL
systemctl stop postgresql

# Restore base backup
rm -rf /var/lib/postgresql/14/main/*
tar -xzf /backup/base/20241201/base.tar.gz -C /var/lib/postgresql/14/main

# Create recovery.signal
touch /var/lib/postgresql/14/main/recovery.signal
```

```ini
# postgresql.conf or postgresql.auto.conf:
restore_command = 'cp /backup/wal/%f %p'
recovery_target_time = '2024-12-01 14:30:00'
# Or: recovery_target_xid, recovery_target_name, recovery_target_lsn
```

```bash
# Start PostgreSQL (will recover to target)
systemctl start postgresql
```

```sql
-- After recovery, confirm
SELECT pg_is_in_recovery();  -- Should be false after recovery completes
```

---

## Monitoring Best Practices

```sql
-- Create replication status view
CREATE VIEW replication_status AS
SELECT
  client_addr,
  application_name,
  state,
  sync_state,
  pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) / 1024 / 1024 AS lag_mb,
  (pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)::float /
   (1024 * 1024 * 16))::int AS estimated_wal_segments_behind
FROM pg_stat_replication;

-- Alert if lag > 100MB
SELECT * FROM replication_status WHERE lag_mb > 100;

-- Check replication slot disk usage
SELECT
  slot_name,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal
FROM pg_replication_slots;
```

---

## Troubleshooting

```sql
-- 1. Check pg_stat_replication on primary
SELECT * FROM pg_stat_replication;

-- 2. Check replication slot exists
SELECT * FROM pg_replication_slots WHERE slot_name = 'replica_1';

-- 3. Recreate slot if missing
SELECT pg_create_physical_replication_slot('replica_1');

-- Standby too far behind?
-- Option 1: Increase wal_keep_size on primary
-- Option 2: Use replication slots (preferred — prevents WAL deletion)
-- Option 3: Re-baseline standby with pg_basebackup
```

```bash
# Check PostgreSQL logs on standby
tail -f /var/log/postgresql/postgresql-14-main.log

# Check WAL files available on primary
ls -lh /var/lib/postgresql/14/main/pg_wal/
```
