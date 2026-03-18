--
-- PostgreSQL database dump
--

\restrict t0elzRhQFdXviJJix0b1dmW8hAScZh2mRCRKYkO33LIqn46wvzU2pAbqAf0YsMv

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: card_name_aliases_set_norm_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.card_name_aliases_set_norm_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- norm_name is set directly by the application; this trigger is a safety net
      -- in case someone inserts with a raw value that needs normalising.
      RETURN NEW;
    END;
    $$;


--
-- Name: card_sources_set_norm_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.card_sources_set_norm_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.norm_name := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]', '', 'g'));
      RETURN NEW;
    END;
    $$;


--
-- Name: cards_set_norm_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cards_set_norm_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.norm_name := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]', '', 'g'));
      RETURN NEW;
    END;
    $$;


--
-- Name: prevent_nonempty_collection_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_nonempty_collection_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- Allow if the owning user no longer exists (user deletion cascade).
      IF NOT EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
        RETURN OLD;
      END IF;
      -- Block if the collection still has copies
      IF EXISTS (SELECT 1 FROM copies WHERE collection_id = OLD.id LIMIT 1) THEN
        RAISE EXCEPTION
          'Cannot delete collection % — it still has copies. Move them first.',
          OLD.id;
      END IF;
      RETURN OLD;
    END;
    $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id text NOT NULL,
    user_id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    access_token text,
    refresh_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    id_token text,
    password text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    name text,
    date date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    is_auto boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_activities_type CHECK ((type = ANY (ARRAY['acquisition'::text, 'disposal'::text, 'trade'::text, 'reorganization'::text])))
);


--
-- Name: activity_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_items (
    id uuid DEFAULT uuidv7() NOT NULL,
    activity_id uuid NOT NULL,
    user_id text NOT NULL,
    activity_type text NOT NULL,
    copy_id uuid,
    action text NOT NULL,
    from_collection_id uuid,
    from_collection_name text,
    to_collection_id uuid,
    to_collection_name text,
    metadata_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_id uuid CONSTRAINT activity_items_new_printing_id_not_null NOT NULL,
    CONSTRAINT chk_activity_items_action CHECK ((action = ANY (ARRAY['added'::text, 'removed'::text, 'moved'::text]))),
    CONSTRAINT chk_activity_items_collection_presence CHECK ((((action = 'added'::text) AND (to_collection_id IS NOT NULL)) OR ((action = 'removed'::text) AND (from_collection_id IS NOT NULL)) OR ((action = 'moved'::text) AND (from_collection_id IS NOT NULL) AND (to_collection_id IS NOT NULL)))),
    CONSTRAINT chk_activity_items_type_action CHECK ((((activity_type = 'acquisition'::text) AND (action = 'added'::text)) OR ((activity_type = 'disposal'::text) AND (action = 'removed'::text)) OR ((activity_type = 'trade'::text) AND (action = ANY (ARRAY['added'::text, 'removed'::text]))) OR ((activity_type = 'reorganization'::text) AND (action = 'moved'::text))))
);


--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admins (
    user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: card_name_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_name_aliases (
    card_id uuid CONSTRAINT card_name_aliases_new_card_id_not_null NOT NULL,
    norm_name text NOT NULL
);


--
-- Name: card_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_sources (
    id uuid DEFAULT uuidv7() NOT NULL,
    source text NOT NULL,
    source_id text,
    source_entity_id text NOT NULL,
    name text NOT NULL,
    type text,
    super_types text[] DEFAULT '{}'::text[] NOT NULL,
    domains text[] NOT NULL,
    might integer,
    energy integer,
    power integer,
    might_bonus integer,
    rules_text text,
    effect_text text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    extra_data jsonb,
    checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    norm_name text NOT NULL,
    CONSTRAINT chk_card_sources_energy_non_negative CHECK ((energy >= 0)),
    CONSTRAINT chk_card_sources_might_bonus_non_negative CHECK ((might_bonus >= 0)),
    CONSTRAINT chk_card_sources_might_non_negative CHECK ((might >= 0)),
    CONSTRAINT chk_card_sources_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_card_sources_no_empty_effect_text CHECK ((effect_text <> ''::text)),
    CONSTRAINT chk_card_sources_no_empty_extra_data CHECK (((extra_data <> '{}'::jsonb) AND (extra_data <> 'null'::jsonb))),
    CONSTRAINT chk_card_sources_no_empty_rules_text CHECK ((rules_text <> ''::text)),
    CONSTRAINT chk_card_sources_no_empty_source_entity_id CHECK ((source_entity_id <> ''::text)),
    CONSTRAINT chk_card_sources_no_empty_source_id CHECK ((source_id <> ''::text)),
    CONSTRAINT chk_card_sources_no_empty_type CHECK ((type <> ''::text)),
    CONSTRAINT chk_card_sources_power_non_negative CHECK ((power >= 0)),
    CONSTRAINT chk_card_sources_source_not_empty CHECK ((source <> ''::text))
);


--
-- Name: cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cards (
    name text NOT NULL,
    type text NOT NULL,
    super_types text[] DEFAULT '{}'::text[] NOT NULL,
    domains text[] NOT NULL,
    might integer,
    energy integer,
    power integer,
    might_bonus integer,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    rules_text text,
    effect_text text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text NOT NULL,
    id uuid DEFAULT uuidv7() CONSTRAINT cards_new_id_not_null NOT NULL,
    norm_name text NOT NULL,
    CONSTRAINT chk_cards_domains_not_empty CHECK ((array_length(domains, 1) > 0)),
    CONSTRAINT chk_cards_domains_values CHECK ((domains <@ ARRAY['Fury'::text, 'Calm'::text, 'Mind'::text, 'Body'::text, 'Chaos'::text, 'Order'::text, 'Colorless'::text])),
    CONSTRAINT chk_cards_energy_non_negative CHECK ((energy >= 0)),
    CONSTRAINT chk_cards_might_bonus_non_negative CHECK ((might_bonus >= 0)),
    CONSTRAINT chk_cards_might_non_negative CHECK ((might >= 0)),
    CONSTRAINT chk_cards_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_cards_no_empty_effect_text CHECK ((effect_text <> ''::text)),
    CONSTRAINT chk_cards_no_empty_rules_text CHECK ((rules_text <> ''::text)),
    CONSTRAINT chk_cards_power_non_negative CHECK ((power >= 0)),
    CONSTRAINT chk_cards_slug_not_empty CHECK ((slug <> ''::text)),
    CONSTRAINT chk_cards_super_types_values CHECK ((super_types <@ ARRAY['Basic'::text, 'Champion'::text, 'Signature'::text, 'Token'::text])),
    CONSTRAINT chk_cards_type CHECK ((type = ANY (ARRAY['Legend'::text, 'Unit'::text, 'Rune'::text, 'Spell'::text, 'Gear'::text, 'Battlefield'::text])))
);


--
-- Name: collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    description text,
    available_for_deckbuilding boolean DEFAULT true NOT NULL,
    is_inbox boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    share_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_collections_name_not_empty CHECK ((name <> ''::text))
);


--
-- Name: copies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copies (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    collection_id uuid NOT NULL,
    source_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_id uuid CONSTRAINT copies_new_printing_id_not_null NOT NULL
);


--
-- Name: deck_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_cards (
    id uuid DEFAULT uuidv7() NOT NULL,
    deck_id uuid NOT NULL,
    zone text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    card_id uuid CONSTRAINT deck_cards_new_card_id_not_null NOT NULL,
    CONSTRAINT chk_deck_cards_quantity CHECK ((quantity > 0)),
    CONSTRAINT chk_deck_cards_zone CHECK ((zone = ANY (ARRAY['main'::text, 'sideboard'::text])))
);


--
-- Name: decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decks (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    description text,
    format text NOT NULL,
    is_wanted boolean DEFAULT false NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    share_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_decks_format CHECK ((format = ANY (ARRAY['standard'::text, 'freeform'::text]))),
    CONSTRAINT chk_decks_name_not_empty CHECK ((name <> ''::text))
);


--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_flags (
    key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ignored_card_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ignored_card_sources (
    id uuid DEFAULT uuidv7() NOT NULL,
    source text NOT NULL,
    source_entity_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_ignored_card_sources_entity_id_not_empty CHECK ((source_entity_id <> ''::text)),
    CONSTRAINT chk_ignored_card_sources_source_not_empty CHECK ((source <> ''::text))
);


--
-- Name: ignored_printing_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ignored_printing_sources (
    id uuid DEFAULT uuidv7() NOT NULL,
    source text NOT NULL,
    source_entity_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finish text,
    CONSTRAINT chk_ignored_printing_sources_entity_id_not_empty CHECK ((source_entity_id <> ''::text)),
    CONSTRAINT chk_ignored_printing_sources_no_empty_finish CHECK ((finish <> ''::text)),
    CONSTRAINT chk_ignored_printing_sources_source_not_empty CHECK ((source <> ''::text))
);


--
-- Name: kysely_migration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kysely_migration (
    name character varying(255) NOT NULL,
    "timestamp" character varying(255) NOT NULL
);


--
-- Name: kysely_migration_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kysely_migration_lock (
    id character varying(255) NOT NULL,
    is_locked integer DEFAULT 0 NOT NULL
);


--
-- Name: marketplace_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_groups (
    marketplace text NOT NULL,
    group_id integer NOT NULL,
    name text,
    abbreviation text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT uuidv7() CONSTRAINT marketplace_groups_new_id_not_null NOT NULL
);


--
-- Name: marketplace_ignored_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_ignored_products (
    marketplace text NOT NULL,
    external_id integer NOT NULL,
    finish text NOT NULL,
    product_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketplace_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_snapshots (
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    market_cents integer NOT NULL,
    low_cents integer,
    mid_cents integer,
    high_cents integer,
    trend_cents integer,
    avg1_cents integer,
    avg7_cents integer,
    avg30_cents integer,
    id uuid DEFAULT uuidv7() CONSTRAINT marketplace_snapshots_new_id_not_null NOT NULL,
    source_id uuid CONSTRAINT marketplace_snapshots_new_source_id_not_null NOT NULL,
    CONSTRAINT chk_marketplace_snapshots_avg1_cents_non_negative CHECK ((avg1_cents >= 0)),
    CONSTRAINT chk_marketplace_snapshots_avg30_cents_non_negative CHECK ((avg30_cents >= 0)),
    CONSTRAINT chk_marketplace_snapshots_avg7_cents_non_negative CHECK ((avg7_cents >= 0)),
    CONSTRAINT chk_marketplace_snapshots_high_cents_non_negative CHECK ((high_cents >= 0)),
    CONSTRAINT chk_marketplace_snapshots_low_cents_non_negative CHECK ((low_cents >= 0)),
    CONSTRAINT chk_marketplace_snapshots_market_cents_non_negative CHECK ((market_cents >= 0)),
    CONSTRAINT chk_marketplace_snapshots_mid_cents_non_negative CHECK ((mid_cents >= 0)),
    CONSTRAINT chk_marketplace_snapshots_trend_cents_non_negative CHECK ((trend_cents >= 0))
);


--
-- Name: marketplace_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_sources (
    marketplace text NOT NULL,
    external_id integer NOT NULL,
    group_id integer NOT NULL,
    product_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT uuidv7() CONSTRAINT marketplace_sources_new_id_not_null NOT NULL,
    printing_id uuid CONSTRAINT marketplace_sources_new_printing_id_not_null NOT NULL,
    CONSTRAINT chk_marketplace_sources_external_id_positive CHECK ((external_id > 0)),
    CONSTRAINT chk_marketplace_sources_marketplace_not_empty CHECK ((marketplace <> ''::text)),
    CONSTRAINT chk_marketplace_sources_product_name_not_empty CHECK ((product_name <> ''::text))
);


--
-- Name: marketplace_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_staging (
    marketplace text NOT NULL,
    external_id integer NOT NULL,
    group_id integer NOT NULL,
    product_name text NOT NULL,
    finish text NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    market_cents integer NOT NULL,
    low_cents integer,
    mid_cents integer,
    high_cents integer,
    trend_cents integer,
    avg1_cents integer,
    avg7_cents integer,
    avg30_cents integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT uuidv7() CONSTRAINT marketplace_staging_new_id_not_null NOT NULL
);


--
-- Name: marketplace_staging_card_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_staging_card_overrides (
    marketplace text NOT NULL,
    external_id integer NOT NULL,
    finish text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    card_id uuid CONSTRAINT marketplace_staging_card_overrides_new_card_id_not_null NOT NULL
);


--
-- Name: printing_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_images (
    id uuid DEFAULT uuidv7() NOT NULL,
    face text DEFAULT 'front'::text NOT NULL,
    source text NOT NULL,
    original_url text,
    rehosted_url text,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_id uuid CONSTRAINT printing_images_new_printing_id_not_null NOT NULL,
    CONSTRAINT chk_printing_images_face CHECK ((face = ANY (ARRAY['front'::text, 'back'::text]))),
    CONSTRAINT chk_printing_images_has_url CHECK (((original_url IS NOT NULL) OR (rehosted_url IS NOT NULL))),
    CONSTRAINT chk_printing_images_no_empty_original_url CHECK ((original_url <> ''::text)),
    CONSTRAINT chk_printing_images_no_empty_rehosted_url CHECK ((rehosted_url <> ''::text)),
    CONSTRAINT chk_printing_images_source_not_empty CHECK ((source <> ''::text))
);


--
-- Name: printing_link_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_link_overrides (
    source_entity_id text NOT NULL,
    finish text NOT NULL,
    printing_slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_plo_no_empty_printing_slug CHECK ((printing_slug <> ''::text)),
    CONSTRAINT chk_plo_no_empty_source_entity_id CHECK ((source_entity_id <> ''::text))
);


--
-- Name: printing_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_sources (
    id uuid DEFAULT uuidv7() NOT NULL,
    card_source_id uuid NOT NULL,
    source_id text NOT NULL,
    set_id text,
    set_name text,
    collector_number integer,
    rarity text,
    art_variant text,
    is_signed boolean,
    finish text,
    artist text,
    public_code text,
    printed_rules_text text,
    printed_effect_text text DEFAULT ''::text,
    flavor_text text DEFAULT ''::text,
    image_url text,
    extra_data jsonb,
    checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_id uuid,
    source_entity_id text NOT NULL,
    promo_type_id uuid,
    CONSTRAINT chk_printing_sources_collector_number_positive CHECK ((collector_number > 0)),
    CONSTRAINT chk_printing_sources_no_empty_art_variant CHECK ((art_variant <> ''::text)),
    CONSTRAINT chk_printing_sources_no_empty_artist CHECK ((artist <> ''::text)),
    CONSTRAINT chk_printing_sources_no_empty_extra_data CHECK (((extra_data <> '{}'::jsonb) AND (extra_data <> 'null'::jsonb))),
    CONSTRAINT chk_printing_sources_no_empty_finish CHECK ((finish <> ''::text)),
    CONSTRAINT chk_printing_sources_no_empty_flavor_text CHECK ((flavor_text <> ''::text)),
    CONSTRAINT chk_printing_sources_no_empty_image_url CHECK ((image_url <> ''::text)),
    CONSTRAINT chk_printing_sources_no_empty_printed_effect_text CHECK ((printed_effect_text <> ''::text)),
    CONSTRAINT chk_printing_sources_no_empty_printed_rules_text CHECK ((printed_rules_text <> ''::text)),
    CONSTRAINT chk_printing_sources_no_empty_rarity CHECK ((rarity <> ''::text)),
    CONSTRAINT chk_printing_sources_no_empty_set_id CHECK ((set_id <> ''::text)),
    CONSTRAINT chk_printing_sources_no_empty_set_name CHECK ((set_name <> ''::text)),
    CONSTRAINT chk_printing_sources_no_empty_source_entity_id CHECK ((source_entity_id <> ''::text)),
    CONSTRAINT chk_printing_sources_public_code_not_empty CHECK ((public_code <> ''::text)),
    CONSTRAINT chk_printing_sources_source_id_not_empty CHECK ((source_id <> ''::text))
);


--
-- Name: printings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printings (
    source_id text NOT NULL,
    collector_number integer NOT NULL,
    rarity text NOT NULL,
    art_variant text NOT NULL,
    is_signed boolean DEFAULT false NOT NULL,
    finish text NOT NULL,
    artist text NOT NULL,
    public_code text NOT NULL,
    printed_rules_text text,
    printed_effect_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    flavor_text text,
    slug text NOT NULL,
    id uuid DEFAULT uuidv7() CONSTRAINT printings_new_id_not_null NOT NULL,
    card_id uuid CONSTRAINT printings_new_card_id_not_null NOT NULL,
    set_id uuid CONSTRAINT printings_new_set_id_not_null NOT NULL,
    comment text,
    promo_type_id uuid,
    CONSTRAINT chk_printings_art_variant CHECK ((art_variant = ANY (ARRAY['normal'::text, 'altart'::text, 'overnumbered'::text]))),
    CONSTRAINT chk_printings_artist_not_empty CHECK ((artist <> ''::text)),
    CONSTRAINT chk_printings_collector_number_positive CHECK ((collector_number > 0)),
    CONSTRAINT chk_printings_finish CHECK ((finish = ANY (ARRAY['normal'::text, 'foil'::text]))),
    CONSTRAINT chk_printings_no_empty_comment CHECK ((comment <> ''::text)),
    CONSTRAINT chk_printings_no_empty_flavor_text CHECK ((flavor_text <> ''::text)),
    CONSTRAINT chk_printings_no_empty_printed_effect_text CHECK ((printed_effect_text <> ''::text)),
    CONSTRAINT chk_printings_no_empty_printed_rules_text CHECK ((printed_rules_text <> ''::text)),
    CONSTRAINT chk_printings_public_code_not_empty CHECK ((public_code <> ''::text)),
    CONSTRAINT chk_printings_rarity CHECK ((rarity = ANY (ARRAY['Common'::text, 'Uncommon'::text, 'Rare'::text, 'Epic'::text, 'Showcase'::text]))),
    CONSTRAINT chk_printings_slug_not_empty CHECK ((slug <> ''::text)),
    CONSTRAINT chk_printings_source_id_not_empty CHECK ((source_id <> ''::text))
);


--
-- Name: promo_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_types (
    id uuid DEFAULT uuidv7() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promo_types_label_check CHECK ((label <> ''::text)),
    CONSTRAINT promo_types_slug_check CHECK ((slug <> ''::text))
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sets (
    name text NOT NULL,
    printed_total integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    released_at date,
    slug text NOT NULL,
    id uuid DEFAULT uuidv7() CONSTRAINT sets_new_id_not_null NOT NULL,
    CONSTRAINT chk_sets_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_sets_printed_total_non_negative CHECK ((printed_total >= 0)),
    CONSTRAINT chk_sets_slug_not_empty CHECK ((slug <> ''::text))
);


--
-- Name: sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sources (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trade_list_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_list_items (
    id uuid DEFAULT uuidv7() NOT NULL,
    trade_list_id uuid NOT NULL,
    user_id text NOT NULL,
    copy_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trade_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_lists (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    rules jsonb,
    share_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    name text,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verifications (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wish_list_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wish_list_items (
    id uuid DEFAULT uuidv7() NOT NULL,
    wish_list_id uuid NOT NULL,
    user_id text NOT NULL,
    quantity_desired integer DEFAULT 1 NOT NULL,
    printing_id uuid,
    card_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_wish_list_items_quantity CHECK ((quantity_desired > 0)),
    CONSTRAINT chk_wish_list_items_target_xor CHECK (((card_id IS NOT NULL) <> (printing_id IS NOT NULL)))
);


--
-- Name: wish_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wish_lists (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    rules jsonb,
    share_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: activity_items activity_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_items
    ADD CONSTRAINT activity_items_pkey PRIMARY KEY (id);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (user_id);


--
-- Name: card_name_aliases card_name_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_name_aliases
    ADD CONSTRAINT card_name_aliases_pkey PRIMARY KEY (norm_name);


--
-- Name: card_sources card_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_sources
    ADD CONSTRAINT card_sources_pkey PRIMARY KEY (id);


--
-- Name: cards cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards
    ADD CONSTRAINT cards_pkey PRIMARY KEY (id);


--
-- Name: cards cards_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards
    ADD CONSTRAINT cards_slug_key UNIQUE (slug);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: collections collections_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_share_token_key UNIQUE (share_token);


--
-- Name: copies copies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT copies_pkey PRIMARY KEY (id);


--
-- Name: deck_cards deck_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_cards
    ADD CONSTRAINT deck_cards_pkey PRIMARY KEY (id);


--
-- Name: decks decks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_pkey PRIMARY KEY (id);


--
-- Name: decks decks_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_share_token_key UNIQUE (share_token);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key);


--
-- Name: ignored_card_sources ignored_card_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ignored_card_sources
    ADD CONSTRAINT ignored_card_sources_pkey PRIMARY KEY (id);


--
-- Name: ignored_printing_sources ignored_printing_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ignored_printing_sources
    ADD CONSTRAINT ignored_printing_sources_pkey PRIMARY KEY (id);


--
-- Name: kysely_migration_lock kysely_migration_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kysely_migration_lock
    ADD CONSTRAINT kysely_migration_lock_pkey PRIMARY KEY (id);


--
-- Name: kysely_migration kysely_migration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kysely_migration
    ADD CONSTRAINT kysely_migration_pkey PRIMARY KEY (name);


--
-- Name: marketplace_groups marketplace_groups_marketplace_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_groups
    ADD CONSTRAINT marketplace_groups_marketplace_group_id_key UNIQUE (marketplace, group_id);


--
-- Name: marketplace_groups marketplace_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_groups
    ADD CONSTRAINT marketplace_groups_pkey PRIMARY KEY (id);


--
-- Name: marketplace_ignored_products marketplace_ignored_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_ignored_products
    ADD CONSTRAINT marketplace_ignored_products_pkey PRIMARY KEY (marketplace, external_id, finish);


--
-- Name: marketplace_snapshots marketplace_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_pkey PRIMARY KEY (id);


--
-- Name: marketplace_snapshots marketplace_snapshots_source_id_recorded_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_source_id_recorded_at_key UNIQUE (source_id, recorded_at);


--
-- Name: marketplace_sources marketplace_sources_marketplace_printing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sources
    ADD CONSTRAINT marketplace_sources_marketplace_printing_id_key UNIQUE (marketplace, printing_id);


--
-- Name: marketplace_sources marketplace_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sources
    ADD CONSTRAINT marketplace_sources_pkey PRIMARY KEY (id);


--
-- Name: marketplace_staging_card_overrides marketplace_staging_card_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_staging_card_overrides
    ADD CONSTRAINT marketplace_staging_card_overrides_pkey PRIMARY KEY (marketplace, external_id, finish);


--
-- Name: marketplace_staging marketplace_staging_marketplace_external_id_finish_recorded_at_; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_staging
    ADD CONSTRAINT marketplace_staging_marketplace_external_id_finish_recorded_at_ UNIQUE (marketplace, external_id, finish, recorded_at);


--
-- Name: marketplace_staging marketplace_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_staging
    ADD CONSTRAINT marketplace_staging_pkey PRIMARY KEY (id);


--
-- Name: printing_images printing_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_images
    ADD CONSTRAINT printing_images_pkey PRIMARY KEY (id);


--
-- Name: printing_link_overrides printing_link_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_link_overrides
    ADD CONSTRAINT printing_link_overrides_pkey PRIMARY KEY (source_entity_id, finish);


--
-- Name: printing_sources printing_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_sources
    ADD CONSTRAINT printing_sources_pkey PRIMARY KEY (id);


--
-- Name: printings printings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT printings_pkey PRIMARY KEY (id);


--
-- Name: printings printings_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT printings_slug_key UNIQUE (slug);


--
-- Name: promo_types promo_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_types
    ADD CONSTRAINT promo_types_pkey PRIMARY KEY (id);


--
-- Name: promo_types promo_types_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_types
    ADD CONSTRAINT promo_types_slug_key UNIQUE (slug);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sets sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_pkey PRIMARY KEY (id);


--
-- Name: sets sets_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_slug_key UNIQUE (slug);


--
-- Name: sources sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_pkey PRIMARY KEY (id);


--
-- Name: trade_list_items trade_list_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_list_items
    ADD CONSTRAINT trade_list_items_pkey PRIMARY KEY (id);


--
-- Name: trade_lists trade_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_lists
    ADD CONSTRAINT trade_lists_pkey PRIMARY KEY (id);


--
-- Name: trade_lists trade_lists_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_lists
    ADD CONSTRAINT trade_lists_share_token_key UNIQUE (share_token);


--
-- Name: activities uq_activities_id_user_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT uq_activities_id_user_type UNIQUE (id, user_id, type);


--
-- Name: collections uq_collections_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT uq_collections_id_user UNIQUE (id, user_id);


--
-- Name: copies uq_copies_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT uq_copies_id_user UNIQUE (id, user_id);


--
-- Name: decks uq_decks_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT uq_decks_id_user UNIQUE (id, user_id);


--
-- Name: printings uq_printings_variant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT uq_printings_variant UNIQUE (source_id, art_variant, is_signed, promo_type_id, rarity, finish);


--
-- Name: sources uq_sources_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT uq_sources_id_user UNIQUE (id, user_id);


--
-- Name: trade_list_items uq_trade_list_items; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_list_items
    ADD CONSTRAINT uq_trade_list_items UNIQUE (trade_list_id, copy_id);


--
-- Name: trade_lists uq_trade_lists_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_lists
    ADD CONSTRAINT uq_trade_lists_id_user UNIQUE (id, user_id);


--
-- Name: wish_lists uq_wish_lists_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_lists
    ADD CONSTRAINT uq_wish_lists_id_user UNIQUE (id, user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verifications verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verifications
    ADD CONSTRAINT verifications_pkey PRIMARY KEY (id);


--
-- Name: wish_list_items wish_list_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_list_items
    ADD CONSTRAINT wish_list_items_pkey PRIMARY KEY (id);


--
-- Name: wish_lists wish_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_lists
    ADD CONSTRAINT wish_lists_pkey PRIMARY KEY (id);


--
-- Name: wish_lists wish_lists_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_lists
    ADD CONSTRAINT wish_lists_share_token_key UNIQUE (share_token);


--
-- Name: idx_accounts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_user_id ON public.accounts USING btree (user_id);


--
-- Name: idx_activities_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_user_id ON public.activities USING btree (user_id);


--
-- Name: idx_activity_items_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_items_activity ON public.activity_items USING btree (activity_id);


--
-- Name: idx_activity_items_copy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_items_copy ON public.activity_items USING btree (copy_id);


--
-- Name: idx_card_sources_norm_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_sources_norm_name ON public.card_sources USING btree (norm_name);


--
-- Name: idx_card_sources_source_name_no_sid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_card_sources_source_name_no_sid ON public.card_sources USING btree (source, name) WHERE (source_id IS NULL);


--
-- Name: idx_card_sources_source_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_card_sources_source_source_id ON public.card_sources USING btree (source, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: idx_card_sources_unchecked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_sources_unchecked ON public.card_sources USING btree (checked_at) WHERE (checked_at IS NULL);


--
-- Name: idx_cards_norm_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cards_norm_name ON public.cards USING btree (norm_name);


--
-- Name: idx_collections_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collections_user_id ON public.collections USING btree (user_id);


--
-- Name: idx_copies_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_collection ON public.copies USING btree (collection_id);


--
-- Name: idx_copies_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_source ON public.copies USING btree (source_id);


--
-- Name: idx_copies_user_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_user_printing ON public.copies USING btree (user_id, printing_id);


--
-- Name: idx_deck_cards_deck; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_cards_deck ON public.deck_cards USING btree (deck_id);


--
-- Name: idx_decks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decks_user_id ON public.decks USING btree (user_id);


--
-- Name: idx_ignored_card_sources_source_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ignored_card_sources_source_entity ON public.ignored_card_sources USING btree (source, source_entity_id);


--
-- Name: idx_ignored_printing_sources_source_entity_finish; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ignored_printing_sources_source_entity_finish ON public.ignored_printing_sources USING btree (source, source_entity_id, COALESCE(finish, ''::text));


--
-- Name: idx_marketplace_snapshots_source_id_recorded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_snapshots_source_id_recorded_at ON public.marketplace_snapshots USING btree (source_id, recorded_at);


--
-- Name: idx_marketplace_sources_printing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_sources_printing_id ON public.marketplace_sources USING btree (printing_id);


--
-- Name: idx_marketplace_staging_marketplace_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_staging_marketplace_group_id ON public.marketplace_staging USING btree (marketplace, group_id);


--
-- Name: idx_printing_images_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_printing_images_active ON public.printing_images USING btree (printing_id, face) WHERE (is_active = true);


--
-- Name: idx_printing_images_printing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_images_printing_id ON public.printing_images USING btree (printing_id);


--
-- Name: idx_printing_images_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_printing_images_source ON public.printing_images USING btree (printing_id, face, source);


--
-- Name: idx_printing_sources_card_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_sources_card_source ON public.printing_sources USING btree (card_source_id);


--
-- Name: idx_printing_sources_card_source_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_printing_sources_card_source_printing ON public.printing_sources USING btree (card_source_id, printing_id) WHERE (printing_id IS NOT NULL);


--
-- Name: idx_printing_sources_printing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_sources_printing_id ON public.printing_sources USING btree (printing_id);


--
-- Name: idx_printings_card_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printings_card_id ON public.printings USING btree (card_id);


--
-- Name: idx_printings_rarity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printings_rarity ON public.printings USING btree (rarity);


--
-- Name: idx_printings_set_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printings_set_id ON public.printings USING btree (set_id);


--
-- Name: idx_sessions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sessions_token ON public.sessions USING btree (token);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id);


--
-- Name: idx_sources_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sources_user_id ON public.sources USING btree (user_id);


--
-- Name: idx_trade_list_items_copy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trade_list_items_copy ON public.trade_list_items USING btree (copy_id);


--
-- Name: idx_trade_list_items_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trade_list_items_list ON public.trade_list_items USING btree (trade_list_id);


--
-- Name: idx_trade_lists_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trade_lists_user_id ON public.trade_lists USING btree (user_id);


--
-- Name: idx_wish_list_items_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_list_items_list ON public.wish_list_items USING btree (wish_list_id);


--
-- Name: idx_wish_lists_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_lists_user_id ON public.wish_lists USING btree (user_id);


--
-- Name: uq_collections_user_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_collections_user_inbox ON public.collections USING btree (user_id) WHERE (is_inbox = true);


--
-- Name: uq_deck_cards; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_deck_cards ON public.deck_cards USING btree (deck_id, card_id, zone);


--
-- Name: uq_wish_list_items_card; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_wish_list_items_card ON public.wish_list_items USING btree (wish_list_id, card_id);


--
-- Name: uq_wish_list_items_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_wish_list_items_printing ON public.wish_list_items USING btree (wish_list_id, printing_id);


--
-- Name: card_sources trg_card_sources_norm_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_card_sources_norm_name BEFORE INSERT OR UPDATE OF name ON public.card_sources FOR EACH ROW EXECUTE FUNCTION public.card_sources_set_norm_name();


--
-- Name: cards trg_cards_norm_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cards_norm_name BEFORE INSERT OR UPDATE OF name ON public.cards FOR EACH ROW EXECUTE FUNCTION public.cards_set_norm_name();


--
-- Name: collections trg_prevent_nonempty_collection_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_nonempty_collection_delete BEFORE DELETE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.prevent_nonempty_collection_delete();


--
-- Name: accounts accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: activities activities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: activity_items activity_items_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_items
    ADD CONSTRAINT activity_items_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: admins admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: card_name_aliases card_name_aliases_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_name_aliases
    ADD CONSTRAINT card_name_aliases_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;


--
-- Name: collections collections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: copies copies_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT copies_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: copies copies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT copies_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: deck_cards deck_cards_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_cards
    ADD CONSTRAINT deck_cards_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: deck_cards deck_cards_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_cards
    ADD CONSTRAINT deck_cards_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id) ON DELETE CASCADE;


--
-- Name: decks decks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: activity_items fk_activity_items_activity_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_items
    ADD CONSTRAINT fk_activity_items_activity_user FOREIGN KEY (activity_id, user_id, activity_type) REFERENCES public.activities(id, user_id, type) ON DELETE CASCADE;


--
-- Name: activity_items fk_activity_items_copy_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_items
    ADD CONSTRAINT fk_activity_items_copy_user FOREIGN KEY (copy_id, user_id) REFERENCES public.copies(id, user_id) ON DELETE SET NULL (copy_id);


--
-- Name: activity_items fk_activity_items_from_collection_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_items
    ADD CONSTRAINT fk_activity_items_from_collection_user FOREIGN KEY (from_collection_id, user_id) REFERENCES public.collections(id, user_id) ON DELETE SET NULL (from_collection_id);


--
-- Name: activity_items fk_activity_items_to_collection_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_items
    ADD CONSTRAINT fk_activity_items_to_collection_user FOREIGN KEY (to_collection_id, user_id) REFERENCES public.collections(id, user_id) ON DELETE SET NULL (to_collection_id);


--
-- Name: copies fk_copies_collection_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT fk_copies_collection_user FOREIGN KEY (collection_id, user_id) REFERENCES public.collections(id, user_id) ON DELETE CASCADE;


--
-- Name: copies fk_copies_source_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT fk_copies_source_user FOREIGN KEY (source_id, user_id) REFERENCES public.sources(id, user_id) ON DELETE SET NULL (source_id);


--
-- Name: trade_list_items fk_trade_list_items_copy_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_list_items
    ADD CONSTRAINT fk_trade_list_items_copy_user FOREIGN KEY (copy_id, user_id) REFERENCES public.copies(id, user_id) ON DELETE CASCADE;


--
-- Name: trade_list_items fk_trade_list_items_list_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_list_items
    ADD CONSTRAINT fk_trade_list_items_list_user FOREIGN KEY (trade_list_id, user_id) REFERENCES public.trade_lists(id, user_id) ON DELETE CASCADE;


--
-- Name: wish_list_items fk_wish_list_items_list_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_list_items
    ADD CONSTRAINT fk_wish_list_items_list_user FOREIGN KEY (wish_list_id, user_id) REFERENCES public.wish_lists(id, user_id) ON DELETE CASCADE;


--
-- Name: marketplace_snapshots marketplace_snapshots_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.marketplace_sources(id);


--
-- Name: marketplace_sources marketplace_sources_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sources
    ADD CONSTRAINT marketplace_sources_group_fkey FOREIGN KEY (marketplace, group_id) REFERENCES public.marketplace_groups(marketplace, group_id);


--
-- Name: marketplace_sources marketplace_sources_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sources
    ADD CONSTRAINT marketplace_sources_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: marketplace_staging_card_overrides marketplace_staging_card_overrides_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_staging_card_overrides
    ADD CONSTRAINT marketplace_staging_card_overrides_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: printing_images printing_images_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_images
    ADD CONSTRAINT printing_images_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: printing_sources printing_sources_card_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_sources
    ADD CONSTRAINT printing_sources_card_source_id_fkey FOREIGN KEY (card_source_id) REFERENCES public.card_sources(id) ON DELETE CASCADE;


--
-- Name: printing_sources printing_sources_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_sources
    ADD CONSTRAINT printing_sources_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: printing_sources printing_sources_promo_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_sources
    ADD CONSTRAINT printing_sources_promo_type_id_fkey FOREIGN KEY (promo_type_id) REFERENCES public.promo_types(id);


--
-- Name: printings printings_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT printings_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: printings printings_promo_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT printings_promo_type_id_fkey FOREIGN KEY (promo_type_id) REFERENCES public.promo_types(id);


--
-- Name: printings printings_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT printings_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id);


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sources sources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trade_lists trade_lists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_lists
    ADD CONSTRAINT trade_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wish_list_items wish_list_items_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_list_items
    ADD CONSTRAINT wish_list_items_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: wish_list_items wish_list_items_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_list_items
    ADD CONSTRAINT wish_list_items_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: wish_lists wish_lists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wish_lists
    ADD CONSTRAINT wish_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict t0elzRhQFdXviJJix0b1dmW8hAScZh2mRCRKYkO33LIqn46wvzU2pAbqAf0YsMv

