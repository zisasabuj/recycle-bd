--
-- PostgreSQL database dump
--

\restrict n0scYozhY0qHLoYMoAuwB6NZ1Cez0cO1JXKYy9DcD0pLLnjrc5evNnayvsuIBz3

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public."Watchlist" DROP CONSTRAINT IF EXISTS "Watchlist_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."Watchlist" DROP CONSTRAINT IF EXISTS "Watchlist_auctionId_fkey";
ALTER TABLE IF EXISTS ONLY public."Transaction" DROP CONSTRAINT IF EXISTS "Transaction_sellerId_fkey";
ALTER TABLE IF EXISTS ONLY public."Transaction" DROP CONSTRAINT IF EXISTS "Transaction_buyerId_fkey";
ALTER TABLE IF EXISTS ONLY public."Transaction" DROP CONSTRAINT IF EXISTS "Transaction_auctionId_fkey";
ALTER TABLE IF EXISTS ONLY public."Notification" DROP CONSTRAINT IF EXISTS "Notification_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."Chat" DROP CONSTRAINT IF EXISTS "Chat_sellerId_fkey";
ALTER TABLE IF EXISTS ONLY public."Chat" DROP CONSTRAINT IF EXISTS "Chat_buyerId_fkey";
ALTER TABLE IF EXISTS ONLY public."Chat" DROP CONSTRAINT IF EXISTS "Chat_auctionId_fkey";
ALTER TABLE IF EXISTS ONLY public."ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_senderId_fkey";
ALTER TABLE IF EXISTS ONLY public."ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_chatId_fkey";
ALTER TABLE IF EXISTS ONLY public."Bid" DROP CONSTRAINT IF EXISTS "Bid_bidderId_fkey";
ALTER TABLE IF EXISTS ONLY public."Bid" DROP CONSTRAINT IF EXISTS "Bid_auctionId_fkey";
ALTER TABLE IF EXISTS ONLY public."Auction" DROP CONSTRAINT IF EXISTS "Auction_sellerId_fkey";
DROP INDEX IF EXISTS public."Watchlist_userId_idx";
DROP INDEX IF EXISTS public."Watchlist_userId_auctionId_key";
DROP INDEX IF EXISTS public."User_username_key";
DROP INDEX IF EXISTS public."User_email_key";
DROP INDEX IF EXISTS public."Transaction_auctionId_key";
DROP INDEX IF EXISTS public."SystemSetting_key_idx";
DROP INDEX IF EXISTS public."Notification_userId_read_idx";
DROP INDEX IF EXISTS public."Chat_sellerId_lastMessageAt_idx";
DROP INDEX IF EXISTS public."Chat_buyerId_lastMessageAt_idx";
DROP INDEX IF EXISTS public."Chat_auctionId_buyerId_sellerId_key";
DROP INDEX IF EXISTS public."ChatMessage_chatId_createdAt_idx";
DROP INDEX IF EXISTS public."Bid_bidderId_idx";
DROP INDEX IF EXISTS public."Bid_auctionId_amount_idx";
DROP INDEX IF EXISTS public."Auction_status_endsAt_idx";
DROP INDEX IF EXISTS public."Auction_sellerId_idx";
DROP INDEX IF EXISTS public."Auction_category_city_idx";
ALTER TABLE IF EXISTS ONLY public._prisma_migrations DROP CONSTRAINT IF EXISTS _prisma_migrations_pkey;
ALTER TABLE IF EXISTS ONLY public."Watchlist" DROP CONSTRAINT IF EXISTS "Watchlist_pkey";
ALTER TABLE IF EXISTS ONLY public."User" DROP CONSTRAINT IF EXISTS "User_pkey";
ALTER TABLE IF EXISTS ONLY public."Transaction" DROP CONSTRAINT IF EXISTS "Transaction_pkey";
ALTER TABLE IF EXISTS ONLY public."SystemSetting" DROP CONSTRAINT IF EXISTS "SystemSetting_pkey";
ALTER TABLE IF EXISTS ONLY public."Notification" DROP CONSTRAINT IF EXISTS "Notification_pkey";
ALTER TABLE IF EXISTS ONLY public."Chat" DROP CONSTRAINT IF EXISTS "Chat_pkey";
ALTER TABLE IF EXISTS ONLY public."ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_pkey";
ALTER TABLE IF EXISTS ONLY public."Bid" DROP CONSTRAINT IF EXISTS "Bid_pkey";
ALTER TABLE IF EXISTS ONLY public."Auction" DROP CONSTRAINT IF EXISTS "Auction_pkey";
DROP TABLE IF EXISTS public._prisma_migrations;
DROP TABLE IF EXISTS public."Watchlist";
DROP TABLE IF EXISTS public."User";
DROP TABLE IF EXISTS public."Transaction";
DROP TABLE IF EXISTS public."SystemSetting";
DROP TABLE IF EXISTS public."Notification";
DROP TABLE IF EXISTS public."ChatMessage";
DROP TABLE IF EXISTS public."Chat";
DROP TABLE IF EXISTS public."Bid";
DROP TABLE IF EXISTS public."Auction";
DROP TYPE IF EXISTS public."UserRole";
DROP TYPE IF EXISTS public."PaymentStatus";
DROP TYPE IF EXISTS public."AuctionStatus";
--
-- Name: AuctionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuctionStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'PAYMENT_PENDING',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED'
);


--
-- Name: PaymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaymentStatus" AS ENUM (
    'PENDING',
    'PAID',
    'FAILED',
    'REFUNDED'
);


--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserRole" AS ENUM (
    'BUYER',
    'SELLER',
    'BOTH',
    'ADMIN',
    'SUPER_ADMIN'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Auction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Auction" (
    id text NOT NULL,
    "sellerId" text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    images text[],
    category text NOT NULL,
    condition text NOT NULL,
    "basePrice" numeric(12,2) NOT NULL,
    "currentMaxBid" numeric(12,2),
    "bidIncrement" numeric(12,2) DEFAULT 100 NOT NULL,
    city text NOT NULL,
    area text NOT NULL,
    "startsAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endsAt" timestamp(3) without time zone NOT NULL,
    status public."AuctionStatus" DEFAULT 'ACTIVE'::public."AuctionStatus" NOT NULL,
    "winnerId" text,
    "secondWinnerId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    district text,
    thana text,
    "viewCount" integer DEFAULT 0 NOT NULL
);


--
-- Name: Bid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Bid" (
    id text NOT NULL,
    "auctionId" text NOT NULL,
    "bidderId" text NOT NULL,
    amount numeric(12,2) NOT NULL,
    "placedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isWinning" boolean DEFAULT false NOT NULL,
    "isSecond" boolean DEFAULT false NOT NULL
);


--
-- Name: Chat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Chat" (
    id text NOT NULL,
    "auctionId" text NOT NULL,
    "buyerId" text NOT NULL,
    "sellerId" text NOT NULL,
    "lastMessageAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastMessage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ChatMessage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatMessage" (
    id text NOT NULL,
    "chatId" text NOT NULL,
    "senderId" text NOT NULL,
    text text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "readAt" timestamp(3) without time zone
);


--
-- Name: Notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    data jsonb,
    read boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SystemSetting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SystemSetting" (
    key text NOT NULL,
    value text NOT NULL,
    "updatedBy" text,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Transaction" (
    id text NOT NULL,
    "auctionId" text NOT NULL,
    "buyerId" text NOT NULL,
    "sellerId" text NOT NULL,
    "finalAmount" numeric(12,2) NOT NULL,
    "commissionRate" numeric(4,2) DEFAULT 0.20 NOT NULL,
    "commissionAmt" numeric(12,2) NOT NULL,
    "buyerPaid" public."PaymentStatus" DEFAULT 'PENDING'::public."PaymentStatus" NOT NULL,
    "sellerPaid" public."PaymentStatus" DEFAULT 'PENDING'::public."PaymentStatus" NOT NULL,
    "buyerPaidAt" timestamp(3) without time zone,
    "sellerPaidAt" timestamp(3) without time zone,
    "contactUnlocked" boolean DEFAULT false NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    "fullName" text,
    phone text,
    role public."UserRole" DEFAULT 'BOTH'::public."UserRole" NOT NULL,
    rating double precision DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Watchlist" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "auctionId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: Auction; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Auction" (id, "sellerId", title, description, images, category, condition, "basePrice", "currentMaxBid", "bidIncrement", city, area, "startsAt", "endsAt", status, "winnerId", "secondWinnerId", "createdAt", "updatedAt", district, thana, "viewCount") FROM stdin;
cmqhyc6fn000e13rs3yo9q2wd	cmqhw5lij0000gaqn8y145e63	Nike Air Max 270 React - Size 42 (UK 8)	Nike Air Max 270 React, Size 42 EU / 8 UK. Worn only 4-5 times, looks brand new. Original box and spare laces included. Black/white colorway, very versatile. No creases, no marks. Smoke-free, pet-free home.	{https://i.ibb.co/Y7zBqzqq/sneakers.jpg}	Sports	Like New	8500.00	\N	200.00	Dhaka	Mirpur	2026-06-17 10:52:30.995	2026-06-19 10:52:30.993	ACTIVE	\N	\N	2026-06-17 10:52:30.995	2026-06-18 14:33:03.442	\N	\N	0
cmqhyc6gu000g13rs3ahbxxx1	cmqhw5lij0000gaqn8y145e63	Canon EOS R6 Mirrorless Camera Body	Canon EOS R6 full-frame mirrorless camera body. Excellent condition, shutter count under 8,000. Includes 2 original LP-E6NH batteries, charger, strap, and original box. Perfect for wildlife, sports, and portrait photography. 4K 60p video.	{https://i.ibb.co/FbNf5VCR/camera.jpg}	Electronics	Used	125000.00	\N	1000.00	Dhaka	Bashundhara	2026-06-17 10:52:31.038	2026-06-19 10:52:31.032	ACTIVE	\N	\N	2026-06-17 10:52:31.038	2026-06-18 14:33:03.447	\N	\N	0
cmqhznq5a000i13rskngbmge8	cmqhw5lij0000gaqn8y145e63	iPhone 14 Pro 256GB - Silver (Unlocked)	Apple iPhone 14 Pro, 256GB, Silver. Unlocked for all carriers. Battery health 92%. Original box, cable, SIM tool included. Always used with case and screen protector.	{https://i.ibb.co/ynQPBHpQ/iphone.jpg}	Electronics	Like New	65000.00	\N	500.00	Dhaka	Gulshan	2026-06-17 11:29:29.373	2026-06-19 11:29:29.371	ACTIVE	\N	\N	2026-06-17 11:29:29.373	2026-06-18 14:33:03.452	\N	\N	0
cmqhznq6s000k13rsjj8mfeso	cmqhw5lij0000gaqn8y145e63	Sony WH-CH510 Wireless Over-Ear Headphones - Blue	Sony WH-CH510 wireless Bluetooth over-ear headphones in blue. 35-hour battery life, lightweight swivel design, built-in mic for calls. Used 2 months, pristine condition with original packaging.	{https://i.ibb.co/VYg43Yv9/headphones.jpg}	Electronics	Like New	6000.00	\N	100.00	Dhaka	Banani	2026-06-17 11:29:29.428	2026-06-19 11:29:29.426	ACTIVE	\N	\N	2026-06-17 11:29:29.428	2026-06-18 14:33:03.457	\N	\N	0
cmqhyc6da000813rsnm4itoj3	cmqhw5lij0000gaqn8y145e63	MacBook Air M2 - Midnight Black (8GB/256GB)	MacBook Air with M2 chip, 8GB RAM, 256GB SSD. Used for 8 months, in pristine condition. Battery cycle count only 89. Includes original Apple charger and box. AppleCare+ valid for 18 more months. Perfect for students or professionals. Light office use only, no gaming.	{https://i.ibb.co/s9XFXSZZ/macbook.jpg}	Electronics	Like New	85000.00	87000.00	1000.00	Dhaka	Dhanmondi	2026-06-17 10:52:30.91	2026-06-19 10:52:30.909	ACTIVE	\N	\N	2026-06-17 10:52:30.91	2026-06-18 14:33:03.462	\N	\N	0
cmqi9kufp000gu4umq0pipp5t	cmqgutti40000mokkwxxnrh68	Mouse	Logitech	{https://i.ibb.co/nMbF4Bmt/1781687192862-e9df8daab61e173c.jpg}	Electronics	Like New	3000.00	3500.00	200.00	Dhaka	Dhanmondi	2026-06-17 16:07:11.089	2026-06-19 16:07:11.085	ACTIVE	\N	\N	2026-06-17 16:07:11.089	2026-06-18 14:33:35.486	\N	\N	0
cmqhyc6eu000c13rsrreiwaw6	cmqhw5lij0000gaqn8y145e63	Casio Vintage A158WA Digital Watch	Iconic Casio retro digital watch. Brand new, never worn. Original Casio box included. Stainless steel case, water resistant. Perfect daily beater or collector's piece. Classic design that never goes out of style.	{https://i.ibb.co/PzMVhcTb/watch.jpg}	Other	New	3500.00	3800.00	100.00	Dhaka	Uttara	2026-06-17 10:52:30.966	2026-06-19 10:52:30.965	ACTIVE	\N	\N	2026-06-17 10:52:30.966	2026-06-18 14:33:03.418	\N	\N	0
\.


--
-- Data for Name: Bid; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Bid" (id, "auctionId", "bidderId", amount, "placedAt", "isWinning", "isSecond") FROM stdin;
cmqi9ndi0000ju4ump5dhqa96	cmqi9kufp000gu4umq0pipp5t	cmqhw5lij0000gaqn8y145e63	3100.00	2026-06-17 16:09:09.144	f	t
cmqi9nmsq000mu4umxlti9nfs	cmqi9kufp000gu4umq0pipp5t	cmqhw5lij0000gaqn8y145e63	3300.00	2026-06-17 16:09:21.195	f	t
cmqi9o7el000qu4umwsxngrit	cmqi9kufp000gu4umq0pipp5t	cmqhw5lij0000gaqn8y145e63	3500.00	2026-06-17 16:09:47.902	t	f
cmqiyfh3l0002jm6qxm700f3z	cmqhyc6eu000c13rsrreiwaw6	cmqgutti40000mokkwxxnrh68	3600.00	2026-06-18 03:42:50.961	f	t
cmqizae4f0006jm6qudffltq4	cmqhyc6eu000c13rsrreiwaw6	cmqgutti40000mokkwxxnrh68	3800.00	2026-06-18 04:06:53.439	t	f
cmqi3nuzt0006u4umc7p8t96r	cmqhyc6da000813rsnm4itoj3	cmqgutti40000mokkwxxnrh68	86000.00	2026-06-17 13:21:34.121	f	t
cmqj0ajhi000bjm6qgqp0qte3	cmqhyc6da000813rsnm4itoj3	cmqgutti40000mokkwxxnrh68	87000.00	2026-06-18 04:35:00.006	t	f
\.


--
-- Data for Name: Chat; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Chat" (id, "auctionId", "buyerId", "sellerId", "lastMessageAt", "lastMessage", "createdAt") FROM stdin;
\.


--
-- Data for Name: ChatMessage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ChatMessage" (id, "chatId", "senderId", text, "createdAt", "readAt") FROM stdin;
\.


--
-- Data for Name: Notification; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Notification" (id, "userId", type, message, data, read, "createdAt") FROM stdin;
\.


--
-- Data for Name: SystemSetting; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."SystemSetting" (key, value, "updatedBy", "updatedAt") FROM stdin;
edit_mode	OPEN	verify-script	2026-06-18 09:27:08.41
\.


--
-- Data for Name: Transaction; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Transaction" (id, "auctionId", "buyerId", "sellerId", "finalAmount", "commissionRate", "commissionAmt", "buyerPaid", "sellerPaid", "buyerPaidAt", "sellerPaidAt", "contactUnlocked", "completedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."User" (id, username, email, "passwordHash", "fullName", phone, role, rating, "createdAt", "updatedAt") FROM stdin;
cmqguwjm20003mokktu8c8ani	sdcoder07	sdcoder07@gmail.com	$2a$10$jRbN8aw5gOZ0aYmNuKJnsehBjoUtV4hyoWtxHQzxIOvv.wIXUYrAe	\N	\N	BOTH	0	2026-06-16 16:28:36.554	2026-06-16 16:28:36.554
cmqgwb59e00007gbilunb388p	resize_test	r@t.com	$2a$10$RReBAyYncmSdOojqjSBYoOqBOAgCSOKMxP/zdoKQagL02InNiPdA.	\N	\N	BOTH	0	2026-06-16 17:07:57.41	2026-06-16 17:07:57.41
cmqhgm4ua00009pob82j9gecs	tester_bd	tester@bd.local	$2a$10$l8lOfUuB2rB1E.8rYOjfI.PiIyka0vi58Yi1mmmaQWgM6Z2vHRws.	\N	\N	BOTH	0	2026-06-17 02:36:22.402	2026-06-17 02:36:22.402
cmqhw6z830000nlw5c23orq39	testuser99	test99@x.com	$2a$10$VKF/o989IPdoMiFwRRgRV.OmMGoc1fMfCD7EcLRdXtCqDtDtCAYK.	\N	\N	ADMIN	0	2026-06-17 09:52:29.14	2026-06-17 09:53:14.128
cmqhw5lij0000gaqn8y145e63	rootadmin	admin@recycle.bd	$2a$10$/6h/l9OUUl5Ay3Po0MajE.2yBty09AYCBseBpn0hR2sKS8p/bF1jS	rootadmin	\N	SUPER_ADMIN	0	2026-06-17 09:51:24.715	2026-06-17 15:17:43.225
cmqgutti40000mokkwxxnrh68	zisasabuj	zisasabuj@gmail.com	$2a$10$HpS8MuC8BV3xe6037EZNGeqepC51.UCkotKYML0SST192C7d9boo6	Zohirul Islam	01712345678	BOTH	0	2026-06-16 16:26:29.404	2026-06-18 05:33:21.637
\.


--
-- Data for Name: Watchlist; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Watchlist" (id, "userId", "auctionId", "createdAt") FROM stdin;
cmqi9olmj000su4um0sk2nllc	cmqhw5lij0000gaqn8y145e63	cmqi9kufp000gu4umq0pipp5t	2026-06-17 16:10:06.33
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
8d0fa8e6-3933-4ac6-949f-ca1f6a8b4b8c	59b0689dadd43f4ebfdd8226b3635e3fc1b6861d6e090c2c6097f7a7050a5b15	2026-06-16 16:24:22.729533+00	20260616162422_init	\N	\N	2026-06-16 16:24:22.54961+00	1
11c63901-c58d-4ce1-94eb-a1d1fabf967c	9652171838467463166d5f5c62b6bd2418df757f045ce4cc156fd9e0074f7e4c	2026-06-17 02:31:28.163947+00	20260617023128_add_district_thana	\N	\N	2026-06-17 02:31:28.140757+00	1
a8e4ff73-019d-43bf-a314-0b0a535db1d5	fc70a7d2a0d4dd601c1e85046f7d2eefa9fc871de413a7e550809e34b0733263	2026-06-17 09:48:38.957509+00	20260617094838_add_admin_roles	\N	\N	2026-06-17 09:48:38.896642+00	1
d8611696-6ccd-464a-b409-b43171ff6da2	12a293c5960c93007ca85add3ba744ff8ed605a38ddbf432b2d3bb2a35b3e91d	2026-06-17 12:41:30.249357+00	20260617124129_add_watchlist_chat	\N	\N	2026-06-17 12:41:29.259166+00	1
1212080f-ddf6-40f6-afad-ca5e293a8516	e1afa8cd1474e881708d272e56f3d4577818392964ebb217d614c177351cfeb6	2026-06-18 09:16:36.414202+00	20260618091636_add_system_settings	\N	\N	2026-06-18 09:16:36.34609+00	1
\.


--
-- Name: Auction Auction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Auction"
    ADD CONSTRAINT "Auction_pkey" PRIMARY KEY (id);


--
-- Name: Bid Bid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Bid"
    ADD CONSTRAINT "Bid_pkey" PRIMARY KEY (id);


--
-- Name: ChatMessage ChatMessage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatMessage"
    ADD CONSTRAINT "ChatMessage_pkey" PRIMARY KEY (id);


--
-- Name: Chat Chat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chat"
    ADD CONSTRAINT "Chat_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: SystemSetting SystemSetting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SystemSetting"
    ADD CONSTRAINT "SystemSetting_pkey" PRIMARY KEY (key);


--
-- Name: Transaction Transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: Watchlist Watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Watchlist"
    ADD CONSTRAINT "Watchlist_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Auction_category_city_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Auction_category_city_idx" ON public."Auction" USING btree (category, city);


--
-- Name: Auction_sellerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Auction_sellerId_idx" ON public."Auction" USING btree ("sellerId");


--
-- Name: Auction_status_endsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Auction_status_endsAt_idx" ON public."Auction" USING btree (status, "endsAt");


--
-- Name: Bid_auctionId_amount_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Bid_auctionId_amount_idx" ON public."Bid" USING btree ("auctionId", amount);


--
-- Name: Bid_bidderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Bid_bidderId_idx" ON public."Bid" USING btree ("bidderId");


--
-- Name: ChatMessage_chatId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChatMessage_chatId_createdAt_idx" ON public."ChatMessage" USING btree ("chatId", "createdAt");


--
-- Name: Chat_auctionId_buyerId_sellerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Chat_auctionId_buyerId_sellerId_key" ON public."Chat" USING btree ("auctionId", "buyerId", "sellerId");


--
-- Name: Chat_buyerId_lastMessageAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Chat_buyerId_lastMessageAt_idx" ON public."Chat" USING btree ("buyerId", "lastMessageAt");


--
-- Name: Chat_sellerId_lastMessageAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Chat_sellerId_lastMessageAt_idx" ON public."Chat" USING btree ("sellerId", "lastMessageAt");


--
-- Name: Notification_userId_read_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Notification_userId_read_idx" ON public."Notification" USING btree ("userId", read);


--
-- Name: SystemSetting_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SystemSetting_key_idx" ON public."SystemSetting" USING btree (key);


--
-- Name: Transaction_auctionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Transaction_auctionId_key" ON public."Transaction" USING btree ("auctionId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_username_key" ON public."User" USING btree (username);


--
-- Name: Watchlist_userId_auctionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Watchlist_userId_auctionId_key" ON public."Watchlist" USING btree ("userId", "auctionId");


--
-- Name: Watchlist_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Watchlist_userId_idx" ON public."Watchlist" USING btree ("userId");


--
-- Name: Auction Auction_sellerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Auction"
    ADD CONSTRAINT "Auction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Bid Bid_auctionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Bid"
    ADD CONSTRAINT "Bid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES public."Auction"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Bid Bid_bidderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Bid"
    ADD CONSTRAINT "Bid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ChatMessage ChatMessage_chatId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatMessage"
    ADD CONSTRAINT "ChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES public."Chat"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ChatMessage ChatMessage_senderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatMessage"
    ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Chat Chat_auctionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chat"
    ADD CONSTRAINT "Chat_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES public."Auction"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Chat Chat_buyerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chat"
    ADD CONSTRAINT "Chat_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Chat Chat_sellerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chat"
    ADD CONSTRAINT "Chat_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Notification Notification_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Transaction Transaction_auctionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES public."Auction"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Transaction Transaction_buyerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Transaction Transaction_sellerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Watchlist Watchlist_auctionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Watchlist"
    ADD CONSTRAINT "Watchlist_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES public."Auction"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Watchlist Watchlist_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Watchlist"
    ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict n0scYozhY0qHLoYMoAuwB6NZ1Cez0cO1JXKYy9DcD0pLLnjrc5evNnayvsuIBz3

