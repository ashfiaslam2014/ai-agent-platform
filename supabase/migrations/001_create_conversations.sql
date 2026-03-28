create table conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id),
  role text,
  content text,
  created_at timestamptz default now()
);
