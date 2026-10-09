/*
# Create multiplayer rooms table

1. Purpose
   - Supports peer-to-peer online Tetris matchmaking using Supabase Realtime.
   - Players create or join a room by code. The room row stores the shared RNG seed,
     ready states, and match status so both players can synchronize gameplay.

2. New Tables
   - `mp_rooms`
     - `id` (uuid, primary key)
     - `code` (text, unique, 6-char alphanumeric room code)
     - `seed` (bigint, shared deterministic seed for both players' game engines)
     - `status` (text: 'waiting' | 'countdown' | 'playing' | 'finished')
     - `p1_session` (text, player 1 session ID from localStorage)
     - `p1_ready` (boolean, default false)
     - `p2_session` (text, player 2 session ID, nullable)
     - `p2_ready` (boolean, default false)
     - `winner` (int, 1 or 2, nullable)
     - `created_at` (timestamptz, default now())
     - `updated_at` (timestamptz, default now())

3. Security
   - Enable RLS on `mp_rooms`.
   - No sign-in screen in this app, so policies allow anon + authenticated CRUD.
   - The data is intentionally shared between the two players in a room.

4. Notes
   - Garbage attack lines and board state sync happen over Supabase Realtime
     broadcast channels (not via table rows), so no additional columns are needed
     for per-frame game state.
   - Rooms auto-expire: the app deletes stale rooms on creation attempts.
*/

CREATE TABLE IF NOT EXISTS mp_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  seed bigint NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  p1_session text NOT NULL,
  p1_ready boolean NOT NULL DEFAULT false,
  p2_session text,
  p2_ready boolean NOT NULL DEFAULT false,
  winner int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mp_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_rooms" ON mp_rooms;
CREATE POLICY "anon_select_rooms" ON mp_rooms FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_rooms" ON mp_rooms;
CREATE POLICY "anon_insert_rooms" ON mp_rooms FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_rooms" ON mp_rooms;
CREATE POLICY "anon_update_rooms" ON mp_rooms FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_rooms" ON mp_rooms;
CREATE POLICY "anon_delete_rooms" ON mp_rooms FOR DELETE
  TO anon, authenticated USING (true);
