--
-- PostgreSQL database dump
--

\restrict bXa4bpvnCk3eTI3bcGzhrrIBijtSGrUtjZcb60JtUScqlnRbghvr8IG5oAPSM8v

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
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: set_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.set_type AS ENUM (
    'main',
    'supplemental'
);


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
-- Name: marketplace_staging_compute_norm_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marketplace_staging_compute_norm_name(product_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
      SELECT lower(regexp_replace(product_name, '[^a-zA-Z0-9]', '', 'g'))
    $$;


--
-- Name: marketplace_staging_set_norm_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marketplace_staging_set_norm_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.norm_name := marketplace_staging_compute_norm_name(NEW.product_name);
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
-- Name: protect_well_known(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_well_known() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND OLD.is_well_known THEN
        RAISE EXCEPTION 'Cannot delete well-known row "%"', OLD.slug;
      END IF;
      IF TG_OP = 'UPDATE' THEN
        IF OLD.is_well_known AND NEW.slug != OLD.slug THEN
          RAISE EXCEPTION 'Cannot rename well-known row "%"', OLD.slug;
        END IF;
        IF OLD.is_well_known AND NOT NEW.is_well_known THEN
          RAISE EXCEPTION 'Cannot unmark well-known row "%"', OLD.slug;
        END IF;
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$;


--
-- Name: recompute_printing_marker_slugs(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_printing_marker_slugs(target_printing_id uuid) RETURNS void
    LANGUAGE sql
    AS $$
      UPDATE printings
      SET marker_slugs = COALESCE(
        (SELECT array_agg(m.slug ORDER BY m.slug)
         FROM printing_markers pm
         JOIN markers m ON m.id = pm.marker_id
         WHERE pm.printing_id = target_printing_id),
        '{}'::text[]
      )
      WHERE id = target_printing_id;
    $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW IS DISTINCT FROM OLD THEN
        NEW.updated_at := now();
      END IF;
      RETURN NEW;
    END;
    $$;


--
-- Name: trg_distribution_channels_validate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_distribution_channels_validate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      parent_kind text;
      cursor_id uuid;
      depth int := 0;
    BEGIN
      IF NEW.parent_id IS NOT NULL THEN
        SELECT kind INTO parent_kind FROM distribution_channels WHERE id = NEW.parent_id;
        IF parent_kind IS NULL THEN
          RAISE EXCEPTION 'Parent distribution channel % not found', NEW.parent_id;
        END IF;
        IF parent_kind <> NEW.kind THEN
          RAISE EXCEPTION 'Child channel kind (%) must match parent kind (%)',
            NEW.kind, parent_kind;
        END IF;

        cursor_id := NEW.parent_id;
        WHILE cursor_id IS NOT NULL AND depth < 32 LOOP
          IF cursor_id = NEW.id THEN
            RAISE EXCEPTION 'Cycle detected in distribution channel hierarchy';
          END IF;
          SELECT parent_id INTO cursor_id FROM distribution_channels WHERE id = cursor_id;
          depth := depth + 1;
        END LOOP;
        IF depth >= 32 THEN
          RAISE EXCEPTION 'Distribution channel hierarchy exceeds maximum depth';
        END IF;

        IF EXISTS (
          SELECT 1 FROM printing_distribution_channels WHERE channel_id = NEW.parent_id
        ) THEN
          RAISE EXCEPTION 'Cannot attach child under channel % because it already has printings',
            NEW.parent_id;
        END IF;
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.kind IS DISTINCT FROM OLD.kind THEN
        IF EXISTS (
          SELECT 1 FROM distribution_channels WHERE parent_id = NEW.id AND kind <> NEW.kind
        ) THEN
          RAISE EXCEPTION 'Cannot change kind of % because children have a different kind',
            NEW.id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$;


--
-- Name: trg_markers_slug_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_markers_slug_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      affected_id uuid;
    BEGIN
      IF NEW.slug IS DISTINCT FROM OLD.slug THEN
        FOR affected_id IN SELECT printing_id FROM printing_markers WHERE marker_id = NEW.id LOOP
          PERFORM recompute_printing_marker_slugs(affected_id);
        END LOOP;
      END IF;
      RETURN NEW;
    END;
    $$;


--
-- Name: trg_printing_distribution_channels_validate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_printing_distribution_channels_validate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM distribution_channels WHERE parent_id = NEW.channel_id) THEN
        RAISE EXCEPTION 'Channel % has children; printings can only link to leaf channels',
          NEW.channel_id;
      END IF;
      RETURN NEW;
    END;
    $$;


--
-- Name: trg_printing_markers_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_printing_markers_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM recompute_printing_marker_slugs(OLD.printing_id);
        RETURN OLD;
      ELSE
        PERFORM recompute_printing_marker_slugs(NEW.printing_id);
        RETURN NEW;
      END IF;
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
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admins (
    user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: art_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.art_variants (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL
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
    language text,
    printed_name text,
    marker_slugs text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT chk_candidate_printings_no_empty_art_variant CHECK ((art_variant <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_artist CHECK ((artist <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_external_id CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_extra_data CHECK (((extra_data <> '{}'::jsonb) AND (extra_data <> 'null'::jsonb))),
    CONSTRAINT chk_candidate_printings_no_empty_finish CHECK ((finish <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_flavor_text CHECK ((flavor_text <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_image_url CHECK ((image_url <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_language CHECK ((language <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_printed_effect_text CHECK ((printed_effect_text <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_printed_name CHECK ((printed_name <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_printed_rules_text CHECK ((printed_rules_text <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_rarity CHECK ((rarity <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_set_id CHECK ((set_id <> ''::text)),
    CONSTRAINT chk_candidate_printings_no_empty_set_name CHECK ((set_name <> ''::text)),
    CONSTRAINT chk_candidate_printings_public_code_not_empty CHECK ((public_code <> ''::text)),
    CONSTRAINT chk_candidate_printings_short_code_not_empty CHECK ((short_code <> ''::text))
);


--
-- Name: card_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_bans (
    id uuid DEFAULT uuidv7() NOT NULL,
    card_id uuid NOT NULL,
    format_id text NOT NULL,
    banned_at date NOT NULL,
    unbanned_at date,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_card_bans_reason_not_empty CHECK ((reason <> ''::text))
);


--
-- Name: card_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_domains (
    card_id uuid NOT NULL,
    domain_slug text NOT NULL,
    ordinal smallint NOT NULL,
    CONSTRAINT card_domains_ordinal_check CHECK ((ordinal >= 0))
);


--
-- Name: card_errata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_errata (
    id uuid DEFAULT uuidv7() NOT NULL,
    card_id uuid NOT NULL,
    corrected_rules_text text,
    corrected_effect_text text,
    source text NOT NULL,
    source_url text,
    effective_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_card_errata_has_text CHECK (((corrected_rules_text IS NOT NULL) OR (corrected_effect_text IS NOT NULL))),
    CONSTRAINT chk_card_errata_no_empty_corrected_effect_text CHECK ((corrected_effect_text <> ''::text)),
    CONSTRAINT chk_card_errata_no_empty_corrected_rules_text CHECK ((corrected_rules_text <> ''::text)),
    CONSTRAINT chk_card_errata_no_empty_source CHECK ((source <> ''::text)),
    CONSTRAINT chk_card_errata_no_empty_source_url CHECK ((source_url <> ''::text))
);


--
-- Name: card_name_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_name_aliases (
    card_id uuid CONSTRAINT card_name_aliases_new_card_id_not_null NOT NULL,
    norm_name text NOT NULL
);


--
-- Name: card_super_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_super_types (
    card_id uuid NOT NULL,
    super_type_slug text NOT NULL
);


--
-- Name: card_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_types (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL
);


--
-- Name: cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cards (
    name text NOT NULL,
    type text NOT NULL,
    might integer,
    energy integer,
    power integer,
    might_bonus integer,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text NOT NULL,
    id uuid DEFAULT uuidv7() CONSTRAINT cards_new_id_not_null NOT NULL,
    norm_name text NOT NULL,
    comment text,
    CONSTRAINT chk_cards_energy_non_negative CHECK ((energy >= 0)),
    CONSTRAINT chk_cards_might_bonus_non_negative CHECK ((might_bonus >= 0)),
    CONSTRAINT chk_cards_might_non_negative CHECK ((might >= 0)),
    CONSTRAINT chk_cards_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_cards_no_empty_comment CHECK ((comment <> ''::text)),
    CONSTRAINT chk_cards_power_non_negative CHECK ((power >= 0)),
    CONSTRAINT chk_cards_slug_not_empty CHECK ((slug <> ''::text))
);


--
-- Name: collection_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_events (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    action text NOT NULL,
    printing_id uuid NOT NULL,
    copy_id uuid,
    from_collection_id uuid,
    from_collection_name text,
    to_collection_id uuid,
    to_collection_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_collection_events_action CHECK ((action = ANY (ARRAY['added'::text, 'removed'::text, 'moved'::text]))),
    CONSTRAINT chk_collection_events_collection_presence CHECK ((((action = 'added'::text) AND (to_collection_id IS NOT NULL)) OR ((action = 'removed'::text) AND (from_collection_id IS NOT NULL)) OR ((action = 'moved'::text) AND (from_collection_id IS NOT NULL) AND (to_collection_id IS NOT NULL))))
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
    preferred_printing_id uuid,
    CONSTRAINT chk_deck_cards_quantity CHECK ((quantity > 0))
);


--
-- Name: deck_formats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_formats (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL
);


--
-- Name: deck_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_zones (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL
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
    CONSTRAINT chk_decks_name_not_empty CHECK ((name <> ''::text))
);


--
-- Name: distribution_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distribution_channels (
    id uuid DEFAULT uuidv7() CONSTRAINT promo_types_id_not_null NOT NULL,
    slug text CONSTRAINT promo_types_slug_not_null NOT NULL,
    label text CONSTRAINT promo_types_label_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT promo_types_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT promo_types_updated_at_not_null NOT NULL,
    description text,
    sort_order integer DEFAULT 0 CONSTRAINT promo_types_sort_order_not_null NOT NULL,
    kind text DEFAULT 'event'::text NOT NULL,
    parent_id uuid,
    children_label text,
    CONSTRAINT distribution_channels_children_label_check CHECK (((children_label IS NULL) OR (children_label <> ''::text))),
    CONSTRAINT distribution_channels_description_check CHECK ((description <> ''::text)),
    CONSTRAINT distribution_channels_kind_check CHECK ((kind = ANY (ARRAY['event'::text, 'product'::text]))),
    CONSTRAINT distribution_channels_label_check CHECK ((label <> ''::text)),
    CONSTRAINT distribution_channels_no_self_parent CHECK (((parent_id IS NULL) OR (parent_id <> id))),
    CONSTRAINT distribution_channels_slug_check CHECK ((slug <> ''::text))
);


--
-- Name: domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.domains (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL,
    color text,
    CONSTRAINT chk_domains_color CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text))
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
-- Name: finishes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finishes (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL
);


--
-- Name: formats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formats (
    id text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_formats_id_not_empty CHECK ((id <> ''::text)),
    CONSTRAINT chk_formats_name_not_empty CHECK ((name <> ''::text))
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
-- Name: image_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.image_files (
    id uuid DEFAULT uuidv7() CONSTRAINT card_images_id_not_null NOT NULL,
    original_url text,
    rehosted_url text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT card_images_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT card_images_updated_at_not_null NOT NULL,
    rotation smallint DEFAULT 0 NOT NULL,
    CONSTRAINT chk_image_files_has_url CHECK (((original_url IS NOT NULL) OR (rehosted_url IS NOT NULL))),
    CONSTRAINT chk_image_files_original_url CHECK ((original_url <> ''::text)),
    CONSTRAINT chk_image_files_rehosted_url CHECK ((rehosted_url <> ''::text)),
    CONSTRAINT chk_image_files_rotation CHECK ((rotation = ANY (ARRAY[0, 90, 180, 270])))
);


--
-- Name: keyword_styles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.keyword_styles (
    name text NOT NULL,
    color text NOT NULL,
    dark_text boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT keyword_styles_color_check CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text)),
    CONSTRAINT keyword_styles_name_check CHECK ((name <> ''::text))
);


--
-- Name: keyword_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.keyword_translations (
    keyword_name text NOT NULL,
    language text NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_keyword_translations_label_not_empty CHECK ((label <> ''::text))
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
-- Name: languages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.languages (
    code text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT languages_code_not_empty CHECK ((code <> ''::text)),
    CONSTRAINT languages_name_not_empty CHECK ((name <> ''::text))
);


--
-- Name: markers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.markers (
    id uuid DEFAULT uuidv7() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT markers_description_check CHECK ((description <> ''::text)),
    CONSTRAINT markers_label_check CHECK ((label <> ''::text)),
    CONSTRAINT markers_slug_check CHECK ((slug <> ''::text))
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
    product_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketplace_ignored_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_ignored_variants (
    marketplace_product_id uuid NOT NULL,
    finish text NOT NULL,
    language text DEFAULT 'EN'::text NOT NULL,
    product_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketplace_product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_product_variants (
    id uuid DEFAULT uuidv7() NOT NULL,
    marketplace_product_id uuid NOT NULL,
    printing_id uuid NOT NULL,
    finish text NOT NULL,
    language text,
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
    CONSTRAINT chk_marketplace_products_external_id_positive CHECK ((external_id > 0)),
    CONSTRAINT chk_marketplace_products_marketplace_not_empty CHECK ((marketplace <> ''::text)),
    CONSTRAINT chk_marketplace_products_product_name_not_empty CHECK ((product_name <> ''::text))
);


--
-- Name: marketplace_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_snapshots (
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    market_cents integer,
    low_cents integer,
    mid_cents integer,
    high_cents integer,
    trend_cents integer,
    avg1_cents integer,
    avg7_cents integer,
    avg30_cents integer,
    id uuid DEFAULT uuidv7() CONSTRAINT marketplace_snapshots_new_id_not_null NOT NULL,
    variant_id uuid CONSTRAINT marketplace_snapshots_product_id_not_null NOT NULL,
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
    market_cents integer,
    low_cents integer,
    mid_cents integer,
    high_cents integer,
    trend_cents integer,
    avg1_cents integer,
    avg7_cents integer,
    avg30_cents integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT uuidv7() CONSTRAINT marketplace_staging_new_id_not_null NOT NULL,
    language text DEFAULT 'EN'::text NOT NULL,
    norm_name text DEFAULT ''::text NOT NULL
);


--
-- Name: marketplace_staging_card_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_staging_card_overrides (
    marketplace text NOT NULL,
    external_id integer NOT NULL,
    finish text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    card_id uuid CONSTRAINT marketplace_staging_card_overrides_new_card_id_not_null NOT NULL,
    language text DEFAULT 'EN'::text NOT NULL
);


--
-- Name: mv_card_aggregates; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_card_aggregates AS
 SELECT id AS card_id,
    COALESCE(( SELECT array_agg(cd.domain_slug ORDER BY cd.ordinal) AS array_agg
           FROM public.card_domains cd
          WHERE (cd.card_id = c.id)), '{}'::text[]) AS domains,
    COALESCE(( SELECT array_agg(cst.super_type_slug) AS array_agg
           FROM public.card_super_types cst
          WHERE (cst.card_id = c.id)), '{}'::text[]) AS super_types
   FROM public.cards c
  WITH NO DATA;


--
-- Name: printings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printings (
    short_code text CONSTRAINT printings_source_id_not_null NOT NULL,
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
    id uuid DEFAULT uuidv7() CONSTRAINT printings_new_id_not_null NOT NULL,
    card_id uuid CONSTRAINT printings_new_card_id_not_null NOT NULL,
    set_id uuid CONSTRAINT printings_new_set_id_not_null NOT NULL,
    comment text,
    language text DEFAULT 'EN'::text NOT NULL,
    printed_name text,
    marker_slugs text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT chk_printings_artist_not_empty CHECK ((artist <> ''::text)),
    CONSTRAINT chk_printings_no_empty_comment CHECK ((comment <> ''::text)),
    CONSTRAINT chk_printings_no_empty_flavor_text CHECK ((flavor_text <> ''::text)),
    CONSTRAINT chk_printings_no_empty_printed_effect_text CHECK ((printed_effect_text <> ''::text)),
    CONSTRAINT chk_printings_no_empty_printed_name CHECK ((printed_name <> ''::text)),
    CONSTRAINT chk_printings_no_empty_printed_rules_text CHECK ((printed_rules_text <> ''::text)),
    CONSTRAINT chk_printings_public_code_not_empty CHECK ((public_code <> ''::text)),
    CONSTRAINT chk_printings_short_code_not_empty CHECK ((short_code <> ''::text))
);


--
-- Name: mv_latest_printing_prices; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_latest_printing_prices AS
 SELECT DISTINCT ON (target.id, mp.marketplace) target.id AS printing_id,
    mp.marketplace,
        CASE
            WHEN (mp.marketplace = 'cardmarket'::text) THEN COALESCE(snap.low_cents, snap.market_cents)
            ELSE COALESCE(snap.market_cents, snap.low_cents)
        END AS headline_cents
   FROM ((((public.printings target
     JOIN public.printings source ON (((source.card_id = target.card_id) AND (source.short_code = target.short_code) AND (source.finish = target.finish) AND (source.art_variant = target.art_variant) AND (source.is_signed = target.is_signed) AND (source.marker_slugs = target.marker_slugs))))
     JOIN public.marketplace_product_variants mpv ON ((mpv.printing_id = source.id)))
     JOIN public.marketplace_products mp ON ((mp.id = mpv.marketplace_product_id)))
     JOIN public.marketplace_snapshots snap ON ((snap.variant_id = mpv.id)))
  WHERE ((
        CASE
            WHEN (mp.marketplace = 'cardmarket'::text) THEN COALESCE(snap.low_cents, snap.market_cents)
            ELSE COALESCE(snap.market_cents, snap.low_cents)
        END IS NOT NULL) AND ((mpv.language IS NULL) OR (source.id = target.id)))
  ORDER BY target.id, mp.marketplace, snap.recorded_at DESC
  WITH NO DATA;


--
-- Name: printing_distribution_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_distribution_channels (
    printing_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    distribution_note text,
    CONSTRAINT printing_distribution_channels_note_check CHECK ((distribution_note <> ''::text))
);


--
-- Name: printing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    printing_id uuid NOT NULL,
    changes jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_printing_events_event_type CHECK ((event_type = ANY (ARRAY['new'::text, 'changed'::text]))),
    CONSTRAINT chk_printing_events_status CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: printing_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_images (
    id uuid DEFAULT uuidv7() NOT NULL,
    face text DEFAULT 'front'::text NOT NULL,
    provider text CONSTRAINT printing_images_source_not_null NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_id uuid CONSTRAINT printing_images_new_printing_id_not_null NOT NULL,
    image_file_id uuid CONSTRAINT printing_images_card_image_id_not_null NOT NULL,
    CONSTRAINT chk_printing_images_face CHECK ((face = ANY (ARRAY['front'::text, 'back'::text]))),
    CONSTRAINT chk_printing_images_provider_not_empty CHECK ((provider <> ''::text))
);


--
-- Name: printing_link_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_link_overrides (
    external_id text CONSTRAINT printing_link_overrides_source_entity_id_not_null NOT NULL,
    finish text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_id uuid NOT NULL,
    CONSTRAINT chk_plo_no_empty_external_id CHECK ((external_id <> ''::text))
);


--
-- Name: printing_markers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_markers (
    printing_id uuid NOT NULL,
    marker_id uuid NOT NULL
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
    set_type public.set_type DEFAULT 'main'::public.set_type NOT NULL,
    CONSTRAINT chk_sets_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_sets_printed_total_non_negative CHECK ((printed_total >= 0)),
    CONSTRAINT chk_sets_slug_not_empty CHECK ((slug <> ''::text))
);


--
-- Name: printings_ordered; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.printings_ordered AS
 SELECT p.short_code,
    p.rarity,
    p.art_variant,
    p.is_signed,
    p.finish,
    p.artist,
    p.public_code,
    p.printed_rules_text,
    p.printed_effect_text,
    p.created_at,
    p.updated_at,
    p.flavor_text,
    p.id,
    p.card_id,
    p.set_id,
    p.comment,
    p.language,
    p.printed_name,
    p.marker_slugs,
    (row_number() OVER (ORDER BY l.sort_order, s.sort_order, p.short_code, (array_length(p.marker_slugs, 1) IS NOT NULL), COALESCE(( SELECT min(m.sort_order) AS min
           FROM public.markers m
          WHERE (m.slug = ANY (p.marker_slugs))), 0), f.sort_order))::integer AS canonical_rank
   FROM (((public.printings p
     JOIN public.sets s ON ((s.id = p.set_id)))
     JOIN public.finishes f ON ((f.slug = p.finish)))
     JOIN public.languages l ON ((l.code = p.language)));


--
-- Name: provider_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_settings (
    provider text CONSTRAINT source_settings_source_not_null NOT NULL,
    sort_order integer DEFAULT 0 CONSTRAINT source_settings_sort_order_not_null NOT NULL,
    is_hidden boolean DEFAULT false CONSTRAINT source_settings_is_hidden_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT source_settings_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT source_settings_updated_at_not_null NOT NULL,
    is_favorite boolean DEFAULT false NOT NULL,
    CONSTRAINT provider_settings_provider_check CHECK ((provider <> ''::text))
);


--
-- Name: rarities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rarities (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL,
    color text,
    CONSTRAINT chk_rarities_color CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text))
);


--
-- Name: rule_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_versions (
    version text NOT NULL,
    source_type text NOT NULL,
    source_url text,
    published_at date,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rule_versions_source_type_check CHECK ((source_type = ANY (ARRAY['pdf'::text, 'text'::text, 'html'::text, 'manual'::text])))
);


--
-- Name: rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    rule_number text NOT NULL,
    sort_order integer NOT NULL,
    depth smallint NOT NULL,
    rule_type text NOT NULL,
    content text NOT NULL,
    change_type text DEFAULT 'added'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rules_change_type_check CHECK ((change_type = ANY (ARRAY['added'::text, 'modified'::text, 'removed'::text]))),
    CONSTRAINT rules_depth_check CHECK (((depth >= 0) AND (depth <= 3))),
    CONSTRAINT rules_rule_number_check CHECK ((rule_number <> ''::text)),
    CONSTRAINT rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['title'::text, 'subtitle'::text, 'text'::text])))
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
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    key text NOT NULL,
    value text NOT NULL,
    scope text DEFAULT 'web'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT site_settings_key_check CHECK ((key <> ''::text)),
    CONSTRAINT site_settings_scope_check CHECK ((scope = ANY (ARRAY['web'::text, 'api'::text])))
);


--
-- Name: super_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.super_types (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL
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
-- Name: user_feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_feature_flags (
    user_id text NOT NULL,
    flag_key text NOT NULL,
    enabled boolean NOT NULL
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    data jsonb DEFAULT '{"showImages": true, "richEffects": true, "visibleFields": {"type": true, "price": true, "title": true, "number": true, "rarity": true}, "marketplaceOrder": ["tcgplayer", "cardmarket", "cardtrader"]}'::jsonb NOT NULL,
    CONSTRAINT user_preferences_data_max_size CHECK ((length((data)::text) <= 8192))
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
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (user_id);


--
-- Name: art_variants art_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.art_variants
    ADD CONSTRAINT art_variants_pkey PRIMARY KEY (slug);


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
-- Name: card_bans card_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_bans
    ADD CONSTRAINT card_bans_pkey PRIMARY KEY (id);


--
-- Name: card_domains card_domains_card_id_ordinal_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_domains
    ADD CONSTRAINT card_domains_card_id_ordinal_key UNIQUE (card_id, ordinal);


--
-- Name: card_domains card_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_domains
    ADD CONSTRAINT card_domains_pkey PRIMARY KEY (card_id, domain_slug);


--
-- Name: card_errata card_errata_card_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_errata
    ADD CONSTRAINT card_errata_card_id_unique UNIQUE (card_id);


--
-- Name: card_errata card_errata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_errata
    ADD CONSTRAINT card_errata_pkey PRIMARY KEY (id);


--
-- Name: card_name_aliases card_name_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_name_aliases
    ADD CONSTRAINT card_name_aliases_pkey PRIMARY KEY (norm_name);


--
-- Name: card_super_types card_super_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_super_types
    ADD CONSTRAINT card_super_types_pkey PRIMARY KEY (card_id, super_type_slug);


--
-- Name: card_types card_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_types
    ADD CONSTRAINT card_types_pkey PRIMARY KEY (slug);


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
-- Name: collection_events collection_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_events
    ADD CONSTRAINT collection_events_pkey PRIMARY KEY (id);


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
-- Name: deck_formats deck_formats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_formats
    ADD CONSTRAINT deck_formats_pkey PRIMARY KEY (slug);


--
-- Name: deck_zones deck_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_zones
    ADD CONSTRAINT deck_zones_pkey PRIMARY KEY (slug);


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
-- Name: distribution_channels distribution_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_channels
    ADD CONSTRAINT distribution_channels_pkey PRIMARY KEY (id);


--
-- Name: distribution_channels distribution_channels_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_channels
    ADD CONSTRAINT distribution_channels_slug_key UNIQUE (slug);


--
-- Name: domains domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT domains_pkey PRIMARY KEY (slug);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key);


--
-- Name: finishes finishes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finishes
    ADD CONSTRAINT finishes_pkey PRIMARY KEY (slug);


--
-- Name: formats formats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formats
    ADD CONSTRAINT formats_pkey PRIMARY KEY (id);


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
-- Name: image_files image_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_files
    ADD CONSTRAINT image_files_pkey PRIMARY KEY (id);


--
-- Name: keyword_styles keyword_styles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_styles
    ADD CONSTRAINT keyword_styles_pkey PRIMARY KEY (name);


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
-- Name: languages languages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.languages
    ADD CONSTRAINT languages_pkey PRIMARY KEY (code);


--
-- Name: markers markers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markers
    ADD CONSTRAINT markers_pkey PRIMARY KEY (id);


--
-- Name: markers markers_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markers
    ADD CONSTRAINT markers_slug_key UNIQUE (slug);


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
    ADD CONSTRAINT marketplace_ignored_products_pkey PRIMARY KEY (marketplace, external_id);


--
-- Name: marketplace_ignored_variants marketplace_ignored_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_ignored_variants
    ADD CONSTRAINT marketplace_ignored_variants_pkey PRIMARY KEY (marketplace_product_id, finish, language);


--
-- Name: marketplace_product_variants marketplace_product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_variants
    ADD CONSTRAINT marketplace_product_variants_pkey PRIMARY KEY (id);


--
-- Name: marketplace_products marketplace_products_marketplace_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_products_marketplace_external_id_key UNIQUE (marketplace, external_id);


--
-- Name: marketplace_snapshots marketplace_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_pkey PRIMARY KEY (id);


--
-- Name: marketplace_snapshots marketplace_snapshots_variant_id_recorded_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_variant_id_recorded_at_key UNIQUE (variant_id, recorded_at);


--
-- Name: marketplace_products marketplace_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_sources_pkey PRIMARY KEY (id);


--
-- Name: marketplace_staging_card_overrides marketplace_staging_card_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_staging_card_overrides
    ADD CONSTRAINT marketplace_staging_card_overrides_pkey PRIMARY KEY (marketplace, external_id, finish, language);


--
-- Name: marketplace_staging marketplace_staging_marketplace_external_id_finish_language_rec; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_staging
    ADD CONSTRAINT marketplace_staging_marketplace_external_id_finish_language_rec UNIQUE (marketplace, external_id, finish, language, recorded_at);


--
-- Name: marketplace_staging marketplace_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_staging
    ADD CONSTRAINT marketplace_staging_pkey PRIMARY KEY (id);


--
-- Name: printing_distribution_channels printing_distribution_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_distribution_channels
    ADD CONSTRAINT printing_distribution_channels_pkey PRIMARY KEY (printing_id, channel_id);


--
-- Name: printing_events printing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_events
    ADD CONSTRAINT printing_events_pkey PRIMARY KEY (id);


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
-- Name: printing_markers printing_markers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_markers
    ADD CONSTRAINT printing_markers_pkey PRIMARY KEY (printing_id, marker_id);


--
-- Name: printings printings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT printings_pkey PRIMARY KEY (id);


--
-- Name: provider_settings provider_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_settings
    ADD CONSTRAINT provider_settings_pkey PRIMARY KEY (provider);


--
-- Name: rarities rarities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rarities
    ADD CONSTRAINT rarities_pkey PRIMARY KEY (slug);


--
-- Name: rule_versions rule_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_versions
    ADD CONSTRAINT rule_versions_pkey PRIMARY KEY (version);


--
-- Name: rules rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_pkey PRIMARY KEY (id);


--
-- Name: rules rules_version_rule_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_version_rule_number_key UNIQUE (version, rule_number);


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
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (key);


--
-- Name: super_types super_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_types
    ADD CONSTRAINT super_types_pkey PRIMARY KEY (slug);


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
-- Name: keyword_translations uq_keyword_translations_keyword_language; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_translations
    ADD CONSTRAINT uq_keyword_translations_keyword_language UNIQUE (keyword_name, language);


--
-- Name: printings uq_printings_identity; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT uq_printings_identity UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, marker_slugs, language) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: printings uq_printings_variant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT uq_printings_variant UNIQUE (short_code, art_variant, is_signed, marker_slugs, rarity, finish, language) DEFERRABLE INITIALLY DEFERRED;


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
-- Name: user_feature_flags user_feature_flags_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_feature_flags
    ADD CONSTRAINT user_feature_flags_pk PRIMARY KEY (user_id, flag_key);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


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
-- Name: idx_candidate_cards_norm_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candidate_cards_norm_name ON public.candidate_cards USING btree (norm_name);


--
-- Name: idx_candidate_cards_provider_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_candidate_cards_provider_external_id ON public.candidate_cards USING btree (provider, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: idx_candidate_cards_provider_name_no_sid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_candidate_cards_provider_name_no_sid ON public.candidate_cards USING btree (provider, name) WHERE (short_code IS NULL);


--
-- Name: idx_candidate_cards_provider_short_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candidate_cards_provider_short_code ON public.candidate_cards USING btree (provider, short_code) WHERE (short_code IS NOT NULL);


--
-- Name: idx_candidate_cards_unchecked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candidate_cards_unchecked ON public.candidate_cards USING btree (checked_at) WHERE (checked_at IS NULL);


--
-- Name: idx_candidate_printings_candidate_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candidate_printings_candidate_card ON public.candidate_printings USING btree (candidate_card_id);


--
-- Name: idx_candidate_printings_card_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_candidate_printings_card_external_id ON public.candidate_printings USING btree (candidate_card_id, external_id);


--
-- Name: idx_card_domains_domain_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_domains_domain_slug ON public.card_domains USING btree (domain_slug);


--
-- Name: idx_cards_norm_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cards_norm_name ON public.cards USING btree (norm_name);


--
-- Name: idx_collection_events_copy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_events_copy ON public.collection_events USING btree (copy_id);


--
-- Name: idx_collection_events_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_events_user_created ON public.collection_events USING btree (user_id, created_at);


--
-- Name: idx_collections_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collections_user_id ON public.collections USING btree (user_id);


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
-- Name: idx_distribution_channels_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distribution_channels_parent_id ON public.distribution_channels USING btree (parent_id);


--
-- Name: idx_ignored_candidate_cards_provider_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ignored_candidate_cards_provider_external ON public.ignored_candidate_cards USING btree (provider, external_id);


--
-- Name: idx_ignored_candidate_printings_provider_external_finish; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ignored_candidate_printings_provider_external_finish ON public.ignored_candidate_printings USING btree (provider, external_id, COALESCE(finish, ''::text));


--
-- Name: idx_image_files_original_url; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_image_files_original_url ON public.image_files USING btree (original_url) WHERE (original_url IS NOT NULL);


--
-- Name: idx_marketplace_product_variants_printing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_product_variants_printing_id ON public.marketplace_product_variants USING btree (printing_id);


--
-- Name: idx_marketplace_snapshots_variant_id_recorded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_snapshots_variant_id_recorded_at ON public.marketplace_snapshots USING btree (variant_id, recorded_at);


--
-- Name: idx_marketplace_staging_marketplace_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_staging_marketplace_group_id ON public.marketplace_staging USING btree (marketplace, group_id);


--
-- Name: idx_marketplace_staging_norm_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_staging_norm_name_trgm ON public.marketplace_staging USING gin (norm_name public.gin_trgm_ops);


--
-- Name: idx_mv_card_aggregates_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_card_aggregates_pk ON public.mv_card_aggregates USING btree (card_id);


--
-- Name: idx_mv_latest_printing_prices_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk ON public.mv_latest_printing_prices USING btree (printing_id, marketplace);


--
-- Name: idx_printing_distribution_channels_channel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_distribution_channels_channel_id ON public.printing_distribution_channels USING btree (channel_id);


--
-- Name: idx_printing_events_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_events_status_created ON public.printing_events USING btree (status, created_at);


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
-- Name: idx_printing_markers_marker_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_markers_marker_id ON public.printing_markers USING btree (marker_id);


--
-- Name: idx_printing_sources_printing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_sources_printing_id ON public.candidate_printings USING btree (printing_id);


--
-- Name: idx_printings_card_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printings_card_id ON public.printings USING btree (card_id);


--
-- Name: idx_printings_marker_slugs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printings_marker_slugs ON public.printings USING gin (marker_slugs);


--
-- Name: idx_printings_rarity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printings_rarity ON public.printings USING btree (rarity);


--
-- Name: idx_printings_set_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printings_set_id ON public.printings USING btree (set_id);


--
-- Name: idx_rules_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rules_search ON public.rules USING gin (to_tsvector('english'::regconfig, content));


--
-- Name: idx_rules_version_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rules_version_sort ON public.rules USING btree (version, sort_order);


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
-- Name: marketplace_product_variants_product_finish_language_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_product_variants_product_finish_language_key ON public.marketplace_product_variants USING btree (marketplace_product_id, finish, language) NULLS NOT DISTINCT;


--
-- Name: uq_card_bans_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_card_bans_active ON public.card_bans USING btree (card_id, format_id) WHERE (unbanned_at IS NULL);


--
-- Name: uq_collections_user_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_collections_user_inbox ON public.collections USING btree (user_id) WHERE (is_inbox = true);


--
-- Name: uq_deck_cards; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_deck_cards ON public.deck_cards USING btree (deck_id, card_id, zone, preferred_printing_id) NULLS NOT DISTINCT;


--
-- Name: uq_wish_list_items_card; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_wish_list_items_card ON public.wish_list_items USING btree (wish_list_id, card_id);


--
-- Name: uq_wish_list_items_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_wish_list_items_printing ON public.wish_list_items USING btree (wish_list_id, printing_id);


--
-- Name: distribution_channels distribution_channels_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER distribution_channels_validate BEFORE INSERT OR UPDATE ON public.distribution_channels FOR EACH ROW EXECUTE FUNCTION public.trg_distribution_channels_validate();


--
-- Name: keyword_styles keyword_styles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER keyword_styles_set_updated_at BEFORE UPDATE ON public.keyword_styles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: markers markers_slug_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER markers_slug_change AFTER UPDATE OF slug ON public.markers FOR EACH ROW EXECUTE FUNCTION public.trg_markers_slug_change();


--
-- Name: printing_distribution_channels printing_distribution_channels_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER printing_distribution_channels_validate BEFORE INSERT OR UPDATE ON public.printing_distribution_channels FOR EACH ROW EXECUTE FUNCTION public.trg_printing_distribution_channels_validate();


--
-- Name: printing_events printing_events_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER printing_events_set_updated_at BEFORE UPDATE ON public.printing_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: printing_markers printing_markers_sync_iud; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER printing_markers_sync_iud AFTER INSERT OR DELETE OR UPDATE ON public.printing_markers FOR EACH ROW EXECUTE FUNCTION public.trg_printing_markers_sync();


--
-- Name: site_settings site_settings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER site_settings_set_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: art_variants trg_art_variants_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_art_variants_protect_well_known BEFORE DELETE OR UPDATE ON public.art_variants FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: candidate_cards trg_candidate_cards_norm_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_candidate_cards_norm_name BEFORE INSERT OR UPDATE OF name ON public.candidate_cards FOR EACH ROW EXECUTE FUNCTION public.candidate_cards_set_norm_name();


--
-- Name: card_types trg_card_types_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_card_types_protect_well_known BEFORE DELETE OR UPDATE ON public.card_types FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: cards trg_cards_norm_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cards_norm_name BEFORE INSERT OR UPDATE OF name ON public.cards FOR EACH ROW EXECUTE FUNCTION public.cards_set_norm_name();


--
-- Name: deck_formats trg_deck_formats_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deck_formats_protect_well_known BEFORE DELETE OR UPDATE ON public.deck_formats FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: deck_zones trg_deck_zones_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deck_zones_protect_well_known BEFORE DELETE OR UPDATE ON public.deck_zones FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: domains trg_domains_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_domains_protect_well_known BEFORE DELETE OR UPDATE ON public.domains FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: finishes trg_finishes_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_finishes_protect_well_known BEFORE DELETE OR UPDATE ON public.finishes FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: marketplace_staging trg_marketplace_staging_set_norm_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_staging_set_norm_name BEFORE INSERT OR UPDATE OF product_name ON public.marketplace_staging FOR EACH ROW EXECUTE FUNCTION public.marketplace_staging_set_norm_name();


--
-- Name: collections trg_prevent_nonempty_collection_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_nonempty_collection_delete BEFORE DELETE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.prevent_nonempty_collection_delete();


--
-- Name: rarities trg_rarities_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rarities_protect_well_known BEFORE DELETE OR UPDATE ON public.rarities FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: accounts trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: distribution_channels trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.distribution_channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: feature_flags trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: image_files trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.image_files FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: keyword_translations trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.keyword_translations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: languages trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.languages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: markers trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.markers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_groups trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.marketplace_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_ignored_products trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.marketplace_ignored_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_ignored_variants trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.marketplace_ignored_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_product_variants trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.marketplace_product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: super_types trg_super_types_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_super_types_protect_well_known BEFORE DELETE OR UPDATE ON public.super_types FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: user_preferences user_preferences_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_preferences_set_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: accounts accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


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
-- Name: card_bans card_bans_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_bans
    ADD CONSTRAINT card_bans_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: card_bans card_bans_format_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_bans
    ADD CONSTRAINT card_bans_format_id_fkey FOREIGN KEY (format_id) REFERENCES public.formats(id);


--
-- Name: card_domains card_domains_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_domains
    ADD CONSTRAINT card_domains_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;


--
-- Name: card_domains card_domains_domain_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_domains
    ADD CONSTRAINT card_domains_domain_slug_fkey FOREIGN KEY (domain_slug) REFERENCES public.domains(slug);


--
-- Name: card_errata card_errata_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_errata
    ADD CONSTRAINT card_errata_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;


--
-- Name: card_name_aliases card_name_aliases_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_name_aliases
    ADD CONSTRAINT card_name_aliases_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;


--
-- Name: card_super_types card_super_types_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_super_types
    ADD CONSTRAINT card_super_types_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;


--
-- Name: card_super_types card_super_types_super_type_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_super_types
    ADD CONSTRAINT card_super_types_super_type_slug_fkey FOREIGN KEY (super_type_slug) REFERENCES public.super_types(slug);


--
-- Name: collection_events collection_events_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_events
    ADD CONSTRAINT collection_events_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: collection_events collection_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_events
    ADD CONSTRAINT collection_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


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
-- Name: deck_cards deck_cards_preferred_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_cards
    ADD CONSTRAINT deck_cards_preferred_printing_id_fkey FOREIGN KEY (preferred_printing_id) REFERENCES public.printings(id) ON DELETE SET NULL;


--
-- Name: decks decks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: distribution_channels distribution_channels_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_channels
    ADD CONSTRAINT distribution_channels_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.distribution_channels(id) ON DELETE RESTRICT;


--
-- Name: cards fk_cards_type; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards
    ADD CONSTRAINT fk_cards_type FOREIGN KEY (type) REFERENCES public.card_types(slug);


--
-- Name: collection_events fk_collection_events_copy_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_events
    ADD CONSTRAINT fk_collection_events_copy_user FOREIGN KEY (copy_id, user_id) REFERENCES public.copies(id, user_id) ON DELETE SET NULL (copy_id);


--
-- Name: collection_events fk_collection_events_from_collection_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_events
    ADD CONSTRAINT fk_collection_events_from_collection_user FOREIGN KEY (from_collection_id, user_id) REFERENCES public.collections(id, user_id) ON DELETE SET NULL (from_collection_id);


--
-- Name: collection_events fk_collection_events_to_collection_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_events
    ADD CONSTRAINT fk_collection_events_to_collection_user FOREIGN KEY (to_collection_id, user_id) REFERENCES public.collections(id, user_id) ON DELETE SET NULL (to_collection_id);


--
-- Name: copies fk_copies_collection_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT fk_copies_collection_user FOREIGN KEY (collection_id, user_id) REFERENCES public.collections(id, user_id) ON DELETE CASCADE;


--
-- Name: deck_cards fk_deck_cards_zone; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_cards
    ADD CONSTRAINT fk_deck_cards_zone FOREIGN KEY (zone) REFERENCES public.deck_zones(slug);


--
-- Name: decks fk_decks_format; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT fk_decks_format FOREIGN KEY (format) REFERENCES public.deck_formats(slug);


--
-- Name: printing_link_overrides fk_plo_printing_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_link_overrides
    ADD CONSTRAINT fk_plo_printing_id FOREIGN KEY (printing_id) REFERENCES public.printings(id) ON DELETE CASCADE;


--
-- Name: printing_images fk_printing_images_image_file; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_images
    ADD CONSTRAINT fk_printing_images_image_file FOREIGN KEY (image_file_id) REFERENCES public.image_files(id);


--
-- Name: printings fk_printings_art_variant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT fk_printings_art_variant FOREIGN KEY (art_variant) REFERENCES public.art_variants(slug);


--
-- Name: printings fk_printings_finish; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT fk_printings_finish FOREIGN KEY (finish) REFERENCES public.finishes(slug);


--
-- Name: printings fk_printings_rarity; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT fk_printings_rarity FOREIGN KEY (rarity) REFERENCES public.rarities(slug);


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
-- Name: keyword_translations keyword_translations_keyword_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_translations
    ADD CONSTRAINT keyword_translations_keyword_name_fkey FOREIGN KEY (keyword_name) REFERENCES public.keyword_styles(name) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: keyword_translations keyword_translations_language_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_translations
    ADD CONSTRAINT keyword_translations_language_fkey FOREIGN KEY (language) REFERENCES public.languages(code) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: marketplace_ignored_variants marketplace_ignored_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_ignored_variants
    ADD CONSTRAINT marketplace_ignored_variants_product_id_fkey FOREIGN KEY (marketplace_product_id) REFERENCES public.marketplace_products(id);


--
-- Name: marketplace_product_variants marketplace_product_variants_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_variants
    ADD CONSTRAINT marketplace_product_variants_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: marketplace_product_variants marketplace_product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_variants
    ADD CONSTRAINT marketplace_product_variants_product_id_fkey FOREIGN KEY (marketplace_product_id) REFERENCES public.marketplace_products(id);


--
-- Name: marketplace_snapshots marketplace_snapshots_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_snapshots
    ADD CONSTRAINT marketplace_snapshots_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.marketplace_product_variants(id);


--
-- Name: marketplace_products marketplace_sources_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_sources_group_fkey FOREIGN KEY (marketplace, group_id) REFERENCES public.marketplace_groups(marketplace, group_id);


--
-- Name: marketplace_staging_card_overrides marketplace_staging_card_overrides_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_staging_card_overrides
    ADD CONSTRAINT marketplace_staging_card_overrides_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: printing_distribution_channels printing_distribution_channels_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_distribution_channels
    ADD CONSTRAINT printing_distribution_channels_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.distribution_channels(id) ON DELETE RESTRICT;


--
-- Name: printing_distribution_channels printing_distribution_channels_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_distribution_channels
    ADD CONSTRAINT printing_distribution_channels_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id) ON DELETE CASCADE;


--
-- Name: printing_images printing_images_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_images
    ADD CONSTRAINT printing_images_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: printing_markers printing_markers_marker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_markers
    ADD CONSTRAINT printing_markers_marker_id_fkey FOREIGN KEY (marker_id) REFERENCES public.markers(id) ON DELETE RESTRICT;


--
-- Name: printing_markers printing_markers_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_markers
    ADD CONSTRAINT printing_markers_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id) ON DELETE CASCADE;


--
-- Name: candidate_printings printing_sources_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_printings
    ADD CONSTRAINT printing_sources_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: printings printings_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT printings_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: printings printings_language_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT printings_language_fk FOREIGN KEY (language) REFERENCES public.languages(code);


--
-- Name: printings printings_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT printings_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id);


--
-- Name: rules rules_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_version_fkey FOREIGN KEY (version) REFERENCES public.rule_versions(version) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trade_lists trade_lists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_lists
    ADD CONSTRAINT trade_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_feature_flags user_feature_flags_flag_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_feature_flags
    ADD CONSTRAINT user_feature_flags_flag_key_fkey FOREIGN KEY (flag_key) REFERENCES public.feature_flags(key) ON DELETE CASCADE;


--
-- Name: user_feature_flags user_feature_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_feature_flags
    ADD CONSTRAINT user_feature_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


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

\unrestrict bXa4bpvnCk3eTI3bcGzhrrIBijtSGrUtjZcb60JtUScqlnRbghvr8IG5oAPSM8v

