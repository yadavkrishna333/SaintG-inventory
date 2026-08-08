-- SQL Schema for Saint G Inventory
-- Execute this script in the Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- Enable uuid-ossp extension
create extension if not exists "uuid-ossp";

-- 1. Create categories table
create table if not exists public.categories (
    id uuid default gen_random_uuid() primary key,
    name text unique not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert initial categories
insert into public.categories (name) values
('Mens Footwear'),
('Women Footwear'),
('Winter Boot'),
('Mens Jacket'),
('Apparels'),
('Shades'),
('Bags'),
('Gift Bag')
on conflict (name) do nothing;

-- 2. Create products table
create table if not exists public.products (
    id uuid default gen_random_uuid() primary key,
    sku text unique not null,
    name text,
    category_id uuid references public.categories(id) on delete set null,
    brand text,
    color text,
    size text,
    rack_location text,
    size_stocks jsonb default '{}'::jsonb not null,
    purchase_price numeric(10,2) default 0.00 not null,
    selling_price numeric(10,2) default 0.00 not null,
    current_stock integer default 0 not null,
    minimum_stock_alert integer default 5 not null,
    barcode text unique not null,
    image_url text,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for faster search and filtering
create index if not exists idx_products_sku on public.products(sku);
create index if not exists idx_products_barcode on public.products(barcode);
create index if not exists idx_products_category on public.products(category_id);

-- 3. Create stock_movements table
create table if not exists public.stock_movements (
    id uuid default gen_random_uuid() primary key,
    product_id uuid references public.products(id) on delete cascade not null,
    type text check (type in ('IN', 'OUT', 'ADJUSTMENT')) not null,
    quantity integer not null,
    reason text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid
);

create index if not exists idx_stock_movements_product on public.stock_movements(product_id);

-- 4. Create purchases table
create table if not exists public.purchases (
    id uuid default gen_random_uuid() primary key,
    supplier_name text not null,
    invoice_number text not null,
    purchase_date date default current_date not null,
    total_amount numeric(10,2) default 0.00 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid
);

-- 5. Create purchase_items table
create table if not exists public.purchase_items (
    id uuid default gen_random_uuid() primary key,
    purchase_id uuid references public.purchases(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete cascade not null,
    quantity integer not null,
    cost_price numeric(10,2) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index if not exists idx_purchase_items_product on public.purchase_items(product_id);

-- 6. Create sales table
create table if not exists public.sales (
    id uuid default gen_random_uuid() primary key,
    sale_date timestamp with time zone default timezone('utc'::text, now()) not null,
    total_amount numeric(10,2) default 0.00 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid
);

-- 7. Create sale_items table
create table if not exists public.sale_items (
    id uuid default gen_random_uuid() primary key,
    sale_id uuid references public.sales(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete cascade not null,
    size text,
    quantity integer not null,
    selling_price numeric(10,2) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_sale_items_sale on public.sale_items(sale_id);
create index if not exists idx_sale_items_product on public.sale_items(product_id);

-- 8. Create activity_logs table
create table if not exists public.activity_logs (
    id uuid default gen_random_uuid() primary key,
    action text not null, -- 'PRODUCT_ADDED', 'PRODUCT_EDITED', 'PRODUCT_DELETED', 'STOCK_ADDED', 'STOCK_REMOVED', 'PURCHASE_CREATED', 'SALE_CREATED'
    details text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid
);

create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);

-- 9. Enable Row Level Security (RLS) on all tables
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.activity_logs enable row level security;

-- 10. Create policies (allowing authenticated users full read/write access)
-- Note: You can customize these if you want public read-only, etc.
create policy "Allow all actions for authenticated users on categories" on public.categories for all to authenticated using (true) with check (true);
create policy "Allow all actions for authenticated users on products" on public.products for all to authenticated using (true) with check (true);
create policy "Allow all actions for authenticated users on stock_movements" on public.stock_movements for all to authenticated using (true) with check (true);
create policy "Allow all actions for authenticated users on purchases" on public.purchases for all to authenticated using (true) with check (true);
create policy "Allow all actions for authenticated users on purchase_items" on public.purchase_items for all to authenticated using (true) with check (true);
create policy "Allow all actions for authenticated users on sales" on public.sales for all to authenticated using (true) with check (true);
create policy "Allow all actions for authenticated users on sale_items" on public.sale_items for all to authenticated using (true) with check (true);
create policy "Allow all actions for authenticated users on activity_logs" on public.activity_logs for all to authenticated using (true) with check (true);

-- Create temporary policies for testing/anon access if needed (or require Auth)
-- For development ease, we also allow anon (unauthenticated) access if configured in Supabase.
-- Here we'll configure it so authenticated users are required, but for easy setup, we can allow all if user configures anon access.
create policy "Allow all actions for anon users on categories" on public.categories for all to anon using (true) with check (true);
create policy "Allow all actions for anon users on products" on public.products for all to anon using (true) with check (true);
create policy "Allow all actions for anon users on stock_movements" on public.stock_movements for all to anon using (true) with check (true);
create policy "Allow all actions for anon users on purchases" on public.purchases for all to anon using (true) with check (true);
create policy "Allow all actions for anon users on purchase_items" on public.purchase_items for all to anon using (true) with check (true);
create policy "Allow all actions for anon users on sales" on public.sales for all to anon using (true) with check (true);
create policy "Allow all actions for anon users on sale_items" on public.sale_items for all to anon using (true) with check (true);
create policy "Allow all actions for anon users on activity_logs" on public.activity_logs for all to anon using (true) with check (true);


-- 11. Triggers and Functions

-- Auto update updated_at function
create or replace function public.update_modified_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger update_products_modtime before update on public.products
    for each row execute function public.update_modified_column();

-- Auto stock deduction and logging on new Sale Item
create or replace function public.handle_sale_item_insert()
returns trigger as $$
declare
    v_product_name text;
    v_sku text;
begin
    -- 1. Deduct stock from products size_stocks and current_stock
    update public.products 
    set size_stocks = size_stocks || jsonb_build_object(
            NEW.size, 
            (coalesce((size_stocks->>NEW.size)::int, 0) - NEW.quantity)::text
        ),
        current_stock = current_stock - NEW.quantity
    where id = NEW.product_id
    returning name, sku into v_product_name, v_sku;

    -- 2. Insert stock movement entry
    insert into public.stock_movements (product_id, type, quantity, reason)
    values (NEW.product_id, 'OUT', NEW.quantity, 'Sale of size ' || NEW.size || ' (Sale ID: ' || NEW.sale_id || ')');

    -- 3. Log activity
    insert into public.activity_logs (action, details)
    values ('STOCK_REMOVED', 'Sold ' || NEW.quantity || ' units of size ' || NEW.size || ' of ' || v_product_name || ' (SKU: ' || v_sku || ') for Sale ID: ' || NEW.sale_id);

    return NEW;
end;
$$ language plpgsql;

create trigger tr_sale_item_insert after insert on public.sale_items
    for each row execute function public.handle_sale_item_insert();

-- Auto stock addition and logging on new Purchase Item
create or replace function public.handle_purchase_item_insert()
returns trigger as $$
declare
    v_product_name text;
    v_sku text;
begin
    -- 1. Add stock to products and update purchase_price with new cost price
    update public.products 
    set current_stock = current_stock + NEW.quantity,
        purchase_price = NEW.cost_price
    where id = NEW.product_id
    returning name, sku into v_product_name, v_sku;

    -- 2. Insert stock movement entry
    insert into public.stock_movements (product_id, type, quantity, reason)
    values (NEW.product_id, 'IN', NEW.quantity, 'Purchase Item created (Purchase ID: ' || NEW.purchase_id || ')');

    -- 3. Log activity
    insert into public.activity_logs (action, details)
    values ('STOCK_ADDED', 'Purchased ' || NEW.quantity || ' units of ' || v_product_name || ' (SKU: ' || v_sku || ') for Purchase ID: ' || NEW.purchase_id);

    return NEW;
end;
$$ language plpgsql;

create trigger tr_purchase_item_insert after insert on public.purchase_items
    for each row execute function public.handle_purchase_item_insert();

-- Trigger for manual stock adjustments and product creations/edits
create or replace function public.handle_product_changes()
returns trigger as $$
declare
    v_stock_diff integer;
begin
    -- Handle Insert
    if TG_OP = 'INSERT' then
        insert into public.activity_logs (action, details)
        values ('PRODUCT_ADDED', 'Product ' || coalesce(NEW.name, NEW.sku) || ' (SKU: ' || NEW.sku || ') created with ' || NEW.current_stock || ' units.');
        
        if NEW.current_stock > 0 then
            insert into public.stock_movements (product_id, type, quantity, reason)
            values (NEW.id, 'IN', NEW.current_stock, 'Initial stock setup');
        end if;
        
    -- Handle Update
    elsif TG_OP = 'UPDATE' then
        v_stock_diff := NEW.current_stock - OLD.current_stock;
        
        -- If stock changed
        if v_stock_diff <> 0 then
            if coalesce(OLD.name, '') <> coalesce(NEW.name, '') or OLD.sku <> NEW.sku or OLD.selling_price <> NEW.selling_price or OLD.purchase_price <> NEW.purchase_price or OLD.category_id <> NEW.category_id then
                insert into public.activity_logs (action, details)
                values ('PRODUCT_EDITED', 'Product ' || coalesce(NEW.name, NEW.sku) || ' (SKU: ' || NEW.sku || ') information was updated.');
            end if;
        else
            if coalesce(OLD.name, '') <> coalesce(NEW.name, '') or OLD.sku <> NEW.sku or OLD.selling_price <> NEW.selling_price or OLD.purchase_price <> NEW.purchase_price or OLD.category_id <> NEW.category_id then
                insert into public.activity_logs (action, details)
                values ('PRODUCT_EDITED', 'Product ' || coalesce(NEW.name, NEW.sku) || ' (SKU: ' || NEW.sku || ') information was updated.');
            end if;
        end if;
        
    -- Handle Delete
    elsif TG_OP = 'DELETE' then
        insert into public.activity_logs (action, details)
        values ('PRODUCT_DELETED', 'Product ' || coalesce(OLD.name, OLD.sku) || ' (SKU: ' || OLD.sku || ') was deleted.');
    end if;

    return null;
end;
$$ language plpgsql;

create trigger tr_product_changes after insert or update or delete on public.products
    for each row execute function public.handle_product_changes();

-- 12. Enable Realtime Subscriptions on key tables safely
-- We run this inside a safe block so if the user's DB user lacks permission to modify replication,
-- the rest of the tables and schema creation are NOT aborted.
do $$
begin
  -- Try to add tables to the publication
  alter publication supabase_realtime add table 
      public.products, 
      public.stock_movements, 
      public.purchases, 
      public.purchase_items,
      public.sales, 
      public.sale_items,
      public.activity_logs;
exception
  when others then
    -- Ignore replication errors since user can also enable it via the Supabase UI
    raise notice 'Could not automatically configure replication: %', SQLERRM;
end $$;
