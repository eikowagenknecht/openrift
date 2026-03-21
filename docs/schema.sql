--
-- PostgreSQL database dump
--

\restrict h3qrXZ2lmNyAe3sLo8rdT700FDyxJnKcGwggpielf6anq70d7uGzLqnbpy0mOY8

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
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: candidate_cards_set_norm_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.candidate_cards_set_norm_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.norm_name := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]', '', 'g'));
      RETURN NEW;
    END;
    $$;


--
-- Name: candidate_printings_set_group_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.candidate_printings_set_group_key() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.group_key :=
        COALESCE(NEW.set_id, '') || '|' ||
        COALESCE(NEW.rarity, '') || '|' ||
        CASE
          WHEN NEW.finish IS NOT NULL THEN NEW.finish
          WHEN NEW.rarity IS NULL THEN ''
          WHEN NEW.rarity IN ('Common', 'Uncommon') THEN 'normal'
          ELSE 'foil'
        END || '|' ||
        COALESCE(NEW.promo_type_id::text, '') || '|' ||
        COALESCE(NEW.art_variant, 'normal') || '|' ||
        COALESCE(NEW.is_signed::text, 'false');
      RETURN NEW;
    END;
    $$;


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


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
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
-- Name: acquisition_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acquisition_sources (
    id uuid DEFAULT uuidv7() CONSTRAINT sources_id_not_null NOT NULL,
    user_id text CONSTRAINT sources_user_id_not_null NOT NULL,
    name text CONSTRAINT sources_name_not_null NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT sources_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT sources_updated_at_not_null NOT NULL
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
-- Name: candidate_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.candidate_cards (
    id uuid DEFAULT uuidv7() CONSTRAINT card_sources_id_not_null NOT NULL,
    provider text CONSTRAINT card_sources_source_not_null NOT NULL,
    short_code text,
    external_id text CONSTRAINT card_sources_source_entity_id_not_null NOT NULL,
    name text CONSTRAINT card_sources_name_not_null NOT NULL,
    type text,
    super_types text[] DEFAULT '{}'::text[] CONSTRAINT card_sources_super_types_not_null NOT NULL,
    domains text[] CONSTRAINT card_sources_domains_not_null NOT NULL,
    might integer,
    energy integer,
    power integer,
    might_bonus integer,
    rules_text text,
    effect_text text,
    tags text[] DEFAULT '{}'::text[] CONSTRAINT card_sources_tags_not_null NOT NULL,
    extra_data jsonb,
    checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT card_sources_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT card_sources_updated_at_not_null NOT NULL,
    norm_name text CONSTRAINT card_sources_norm_name_not_null NOT NULL,
    CONSTRAINT chk_candidate_cards_energy_non_negative CHECK ((energy >= 0)),
    CONSTRAINT chk_candidate_cards_might_bonus_non_negative CHECK ((might_bonus >= 0)),
    CONSTRAINT chk_candidate_cards_might_non_negative CHECK ((might >= 0)),
    CONSTRAINT chk_candidate_cards_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_candidate_cards_no_empty_effect_text CHECK ((effect_text <> ''::text)),
    CONSTRAINT chk_candidate_cards_no_empty_external_id CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_candidate_cards_no_empty_extra_data CHECK (((extra_data <> '{}'::jsonb) AND (extra_data <> 'null'::jsonb))),
    CONSTRAINT chk_candidate_cards_no_empty_rules_text CHECK ((rules_text <> ''::text)),
    CONSTRAINT chk_candidate_cards_no_empty_short_code CHECK ((short_code <> ''::text)),
    CONSTRAINT chk_candidate_cards_no_empty_type CHECK ((type <> ''::text)),
    CONSTRAINT chk_candidate_cards_power_non_negative CHECK ((power >= 0)),
    CONSTRAINT chk_candidate_cards_provider_not_empty CHECK ((provider <> ''::text))
);


--
-- Name: candidate_printings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.candidate_printings (
    id uuid DEFAULT uuidv7() CONSTRAINT printing_sources_id_not_null NOT NULL,
    candidate_card_id uuid CONSTRAINT printing_sources_card_source_id_not_null NOT NULL,
    short_code text CONSTRAINT printing_sources_source_id_not_null NOT NULL,
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
    created_at timestamp with time zone DEFAULT now() CONSTRAINT printing_sources_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT printing_sources_updated_at_not_null NOT NULL,
    printing_id uuid,
    external_id text CONSTRAINT printing_sources_source_entity_id_not_null NOT NULL,
    promo_type_id uuid,
    group_key text DEFAULT ''::text CONSTRAINT printing_sources_group_key_not_null NOT NULL,
    CONSTRAINT chk_candidate_printings_collector_number_positive CHECK ((collector_number > 0)),
    CONSTRAINT chk_candidate_printings_no_empty_art_variant CHECK ((art_variant <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_artist CHECK ((artist <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_external_id CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_extra_data CHECK (((extra_data <> '{}'::jsonb) AND (extra_data <> 'null'::jsonb))),
    CONSTRAINT chk_candidate_printings_no_empty_finish CHECK ((finish <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_flavor_text CHECK ((flavor_text <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_image_url CHECK ((image_url <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_printed_effect_text CHECK ((printed_effect_text <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_printed_rules_text CHECK ((printed_rules_text <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_rarity CHECK ((rarity <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_set_id CHECK ((set_id <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_set_name CHECK ((set_name <> ''::text)),
    CONSTRAINT chk_candidate_printings_public_code_not_empty CHECK ((public_code <> ''::text)),
    CONSTRAINT chk_candidate_printings_short_code_not_empty CHECK ((short_code <> ''::text))
);


--
-- Name: card_name_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_name_aliases (
    card_id uuid CONSTRAINT card_name_aliases_new_card_id_not_null NOT NULL,
    norm_name text NOT NULL
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
    comment text,
    CONSTRAINT chk_cards_domains_not_empty CHECK ((array_length(domains, 1) > 0)),
    CONSTRAINT chk_cards_domains_values CHECK ((domains <@ ARRAY['Fury'::text, 'Calm'::text, 'Mind'::text, 'Body'::text, 'Chaos'::text, 'Order'::text, 'Colorless'::text])),
    CONSTRAINT chk_cards_energy_non_negative CHECK ((energy >= 0)),
    CONSTRAINT chk_cards_might_bonus_non_negative CHECK ((might_bonus >= 0)),
    CONSTRAINT chk_cards_might_non_negative CHECK ((might >= 0)),
    CONSTRAINT chk_cards_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_cards_no_empty_comment CHECK ((comment <> ''::text)),
    CONSTRAINT chk_cards_no_empty_effect_text CHECK ((effect_text <> ''::text)),
    CONSTRAINT chk_cards_no_empty_rules_text CHECK ((rules_text <> ''::text)),
    CONSTRAINT chk_cards_power_non_negative CHECK ((power >= 0)),
    CONSTRAINT chk_cards_slug_not_empty CHECK ((slug <> ''::text)),
    CONSTRAINT chk_cards_super_types_values CHECK ((super_types <@ ARRAY['Basic'::text, 'Champion'::text, 'Signature'::text, 'Token'::text])),
    CONSTRAINT chk_cards_type CHECK ((type = ANY (ARRAY['Legend'::text, 'Unit'::text, 'Rune'::text, 'Spell'::text, 'Gear'::text, 'Battlefield'::text, 'Buff'::text])))
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
    acquisition_source_id uuid,
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
-- Name: ignored_candidate_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ignored_candidate_cards (
    id uuid DEFAULT uuidv7() CONSTRAINT ignored_card_sources_id_not_null NOT NULL,
    provider text CONSTRAINT ignored_card_sources_source_not_null NOT NULL,
    external_id text CONSTRAINT ignored_card_sources_source_entity_id_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT ignored_card_sources_created_at_not_null NOT NULL,
    CONSTRAINT chk_ignored_candidate_cards_external_id_not_empty CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_ignored_candidate_cards_provider_not_empty CHECK ((provider <> ''::text))
);


--
-- Name: ignored_candidate_printings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ignored_candidate_printings (
    id uuid DEFAULT uuidv7() CONSTRAINT ignored_printing_sources_id_not_null NOT NULL,
    provider text CONSTRAINT ignored_printing_sources_source_not_null NOT NULL,
    external_id text CONSTRAINT ignored_printing_sources_source_entity_id_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT ignored_printing_sources_created_at_not_null NOT NULL,
    finish text,
    CONSTRAINT chk_ignored_candidate_printings_external_id_not_empty CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_ignored_candidate_printings_no_empty_finish CHECK ((finish <> ''::text)),
    CONSTRAINT chk_ignored_candidate_printings_provider_not_empty CHECK ((provider <> ''::text))
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
-- Name: marketplace_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_products (
    marketplace text CONSTRAINT marketplace_sources_marketplace_not_null NOT NULL,
    external_id integer CONSTRAINT marketplace_sources_external_id_not_null NOT NULL,
    group_id integer CONSTRAINT marketplace_sources_group_id_not_null NOT NULL,
    product_name text CONSTRAINT marketplace_sources_product_name_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT marketplace_sources_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT marketplace_sources_updated_at_not_null NOT NULL,
    id uuid DEFAULT uuidv7() NOT NULL,
    printing_id uuid NOT NULL,
    CONSTRAINT chk_marketplace_products_external_id_positive CHECK ((external_id > 0)),
    CONSTRAINT chk_marketplace_products_marketplace_not_empty CHECK ((marketplace <> ''::text)),
    CONSTRAINT chk_marketplace_products_product_name_not_empty CHECK ((product_name <> ''::text))
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
    product_id uuid NOT NULL,
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
    provider text CONSTRAINT printing_images_source_not_null NOT NULL,
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
    CONSTRAINT chk_printing_images_provider_not_empty CHECK ((provider <> ''::text))
);


--
-- Name: printing_link_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_link_overrides (
    external_id text CONSTRAINT printing_link_overrides_source_entity_id_not_null NOT NULL,
    finish text NOT NULL,
    printing_slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_plo_no_empty_external_id CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_plo_no_empty_printing_slug CHECK ((printing_slug <> ''::text))
);


--
-- Name: printings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printings (
    short_code text CONSTRAINT printings_source_id_not_null NOT NULL,
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
    CONSTRAINT chk_printings_short_code_not_empty CHECK ((short_code <> ''::text)),
    CONSTRAINT chk_printings_slug_not_empty CHECK ((slug <> ''::text))
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
-- Name: provider_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_settings (
    provider text CONSTRAINT source_settings_source_not_null NOT NULL,
    sort_order integer DEFAULT 0 CONSTRAINT source_settings_sort_order_not_null NOT NULL,
    is_hidden boolean DEFAULT false CONSTRAINT source_settings_is_hidden_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT source_settings_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT source_settings_updated_at_not_null NOT NULL,
    CONSTRAINT provider_settings_provider_check CHECK ((provider <> ''::text))
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
-- Name: candidate_cards candidate_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_cards
    ADD CONSTRAINT candidate_cards_pkey PRIMARY KEY (id);


--
-- Name: candidate_printings candidate_printings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_printings
    ADD CONSTRAINT candidate_printings_pkey PRIMARY KEY (id);


--
-- Name: card_name_aliases card_name_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_name_aliases
    ADD CONSTRAINT card_name_aliases_pkey PRIMARY KEY (norm_name);


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
-- Name: ignored_candidate_cards ignored_candidate_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ignored_candidate_cards
    ADD CONSTRAINT ignored_candidate_cards_pkey PRIMARY KEY (id);


--
-- Name: ignored_candidate_printings ignored_candidate_printings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ignored_candidate_printings
    ADD CONSTRAINT ignored_candidate_printings_pkey PRIMARY KEY (id);


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
-- Name: marketplace_snapshots marketplace_snapshots_product_id_recorded_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_product_id_recorded_at_key UNIQUE (product_id, recorded_at);


--
-- Name: marketplace_products marketplace_sources_marketplace_printing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_sources_marketplace_printing_id_key UNIQUE (marketplace, printing_id);


--
-- Name: marketplace_products marketplace_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
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
    ADD CONSTRAINT printing_link_overrides_pkey PRIMARY KEY (external_id, finish);


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
-- Name: provider_settings provider_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_settings
    ADD CONSTRAINT provider_settings_pkey PRIMARY KEY (provider);


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
-- Name: acquisition_sources sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acquisition_sources
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
    ADD CONSTRAINT uq_printings_variant UNIQUE (short_code, art_variant, is_signed, promo_type_id, rarity, finish);


--
-- Name: acquisition_sources uq_sources_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acquisition_sources
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
-- Name: idx_acquisition_sources_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acquisition_sources_user_id ON public.acquisition_sources USING btree (user_id);


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
-- Name: idx_candidate_cards_norm_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candidate_cards_norm_name ON public.candidate_cards USING btree (norm_name);


--
-- Name: idx_candidate_cards_provider_name_no_sid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_candidate_cards_provider_name_no_sid ON public.candidate_cards USING btree (provider, name) WHERE (short_code IS NULL);


--
-- Name: idx_candidate_cards_provider_short_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_candidate_cards_provider_short_code ON public.candidate_cards USING btree (provider, short_code) WHERE (short_code IS NOT NULL);


--
-- Name: idx_candidate_cards_unchecked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candidate_cards_unchecked ON public.candidate_cards USING btree (checked_at) WHERE (checked_at IS NULL);


--
-- Name: idx_candidate_printings_candidate_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candidate_printings_candidate_card ON public.candidate_printings USING btree (candidate_card_id);


--
-- Name: idx_candidate_printings_group_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candidate_printings_group_key ON public.candidate_printings USING btree (candidate_card_id, group_key);


--
-- Name: idx_cards_norm_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cards_norm_name ON public.cards USING btree (norm_name);


--
-- Name: idx_collections_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collections_user_id ON public.collections USING btree (user_id);


--
-- Name: idx_copies_acquisition_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_acquisition_source ON public.copies USING btree (acquisition_source_id);


--
-- Name: idx_copies_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_collection ON public.copies USING btree (collection_id);


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
-- Name: idx_ignored_candidate_cards_provider_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ignored_candidate_cards_provider_external ON public.ignored_candidate_cards USING btree (provider, external_id);


--
-- Name: idx_ignored_candidate_printings_provider_external_finish; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ignored_candidate_printings_provider_external_finish ON public.ignored_candidate_printings USING btree (provider, external_id, COALESCE(finish, ''::text));


--
-- Name: idx_marketplace_snapshots_product_id_recorded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_snapshots_product_id_recorded_at ON public.marketplace_snapshots USING btree (product_id, recorded_at);


--
-- Name: idx_marketplace_sources_printing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_sources_printing_id ON public.marketplace_products USING btree (printing_id);


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
-- Name: idx_printing_images_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_printing_images_provider ON public.printing_images USING btree (printing_id, face, provider);


--
-- Name: idx_printing_sources_printing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_sources_printing_id ON public.candidate_printings USING btree (printing_id);


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
-- Name: candidate_cards trg_candidate_cards_norm_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_candidate_cards_norm_name BEFORE INSERT OR UPDATE OF name ON public.candidate_cards FOR EACH ROW EXECUTE FUNCTION public.candidate_cards_set_norm_name();


--
-- Name: candidate_printings trg_candidate_printings_group_key; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_candidate_printings_group_key BEFORE INSERT OR UPDATE OF set_id, art_variant, is_signed, promo_type_id, rarity, finish ON public.candidate_printings FOR EACH ROW EXECUTE FUNCTION public.candidate_printings_set_group_key();


--
-- Name: cards trg_cards_norm_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cards_norm_name BEFORE INSERT OR UPDATE OF name ON public.cards FOR EACH ROW EXECUTE FUNCTION public.cards_set_norm_name();


--
-- Name: collections trg_prevent_nonempty_collection_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_nonempty_collection_delete BEFORE DELETE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.prevent_nonempty_collection_delete();


--
-- Name: accounts trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: acquisition_sources trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.acquisition_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activities trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: admins trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.admins FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: candidate_cards trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.candidate_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: candidate_printings trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.candidate_printings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: cards trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: collections trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: copies trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.copies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: deck_cards trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.deck_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: decks trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.decks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: feature_flags trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_groups trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.marketplace_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_ignored_products trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.marketplace_ignored_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_products trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.marketplace_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_staging trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.marketplace_staging FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: printing_images trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.printing_images FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: printings trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.printings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: promo_types trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.promo_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: provider_settings trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.provider_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sessions trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sets trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: trade_list_items trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.trade_list_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: trade_lists trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.trade_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: verifications trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.verifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: wish_list_items trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.wish_list_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: wish_lists trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.wish_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: candidate_printings candidate_printings_candidate_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_printings
    ADD CONSTRAINT candidate_printings_candidate_card_id_fkey FOREIGN KEY (candidate_card_id) REFERENCES public.candidate_cards(id) ON DELETE CASCADE;


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
-- Name: copies fk_copies_acquisition_source_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT fk_copies_acquisition_source_user FOREIGN KEY (acquisition_source_id, user_id) REFERENCES public.acquisition_sources(id, user_id) ON DELETE SET NULL (acquisition_source_id);


--
-- Name: copies fk_copies_collection_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT fk_copies_collection_user FOREIGN KEY (collection_id, user_id) REFERENCES public.collections(id, user_id) ON DELETE CASCADE;


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
-- Name: marketplace_snapshots marketplace_snapshots_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id);


--
-- Name: marketplace_products marketplace_sources_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_sources_group_fkey FOREIGN KEY (marketplace, group_id) REFERENCES public.marketplace_groups(marketplace, group_id);


--
-- Name: marketplace_products marketplace_sources_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
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
-- Name: candidate_printings printing_sources_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_printings
    ADD CONSTRAINT printing_sources_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: candidate_printings printing_sources_promo_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_printings
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
-- Name: acquisition_sources sources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acquisition_sources
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

\unrestrict h3qrXZ2lmNyAe3sLo8rdT700FDyxJnKcGwggpielf6anq70d7uGzLqnbpy0mOY8

