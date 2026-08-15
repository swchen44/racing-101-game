# 啟用全球排行榜 (免費,約 5 分鐘)

遊戲的排行榜是雙層設計:**本機成績永遠可用**(存在瀏覽器 localStorage),完成以下設定後會自動多出**全球排行榜**(所有玩家共用)。

## 1. 建立 Supabase 免費專案

1. 到 <https://supabase.com> 用 GitHub 帳號登入,按 **New project**
2. 名稱隨意(例如 `racing-101`),選免費方案,等待專案初始化

## 2. 建立資料表與安全規則

進入專案 → **SQL Editor** → 貼上並執行:

```sql
create table public.scores (
  id bigint generated always as identity primary key,
  mode text not null,
  track_id text not null,
  car_id text not null,
  name text not null check (char_length(name) <= 20),
  time_ms integer not null check (time_ms > 20000),  -- 低於20秒視為作弊丟棄
  best_lap_ms integer,
  masked_ip text,
  created_at timestamptz default now()
);

alter table public.scores enable row level security;

-- 任何人可讀排行榜
create policy "public read" on public.scores for select using (true);

-- 任何人可新增成績,但不能修改/刪除別人的資料
create policy "public insert" on public.scores for insert with check (true);
```

## 3. 把金鑰填進遊戲

專案 → **Settings → API**,複製:
- Project URL(形如 `https://xxxx.supabase.co`)
- `anon` `public` key

打開 `js/config.js`,把最上面改成:

```js
export const LEADERBOARD_REMOTE = {
  url: 'https://xxxx.supabase.co',
  anonKey: 'eyJhbGciOi...',
};
```

commit + push 之後,全球排行榜就上線了。

## 常見問題

**anon key 公開在前端安全嗎?**
這是 Supabase 的設計用途:anon key 只擁有你在 RLS 規則裡授權的能力(這裡是「讀 + 新增」)。無法修改或刪除資料。公開網頁遊戲排行榜無法完全防作弊(玩家可以偽造成績請求),`time_ms > 20000` 的檢查擋掉最誇張的,接受這個限度即可;要更嚴謹需要伺服器端驗證重播資料,那是另一個量級的工程。

**隱私:** 遊戲只上傳**遮罩後的 IP**(例如 `140.112.x.x`),從不傳完整 IP。

**免費額度:** Supabase 免費方案 500MB 資料庫 + 每月 5GB 流量,對排行榜(每筆 <200 bytes)綽綽有餘。
