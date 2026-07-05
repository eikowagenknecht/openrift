--
-- PostgreSQL database dump
--

\restrict UK6njl1ZxaCJwvXYrbDOgax0YyoHWhedY9dqGGkWf4Gj4w3Q7R4iyV7Op4N5Zwk

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
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: marketplace_group_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.marketplace_group_kind AS ENUM (
    'basic',
    'special'
);


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
-- Name: marketplace_product_compute_norm_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marketplace_product_compute_norm_name(product_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
      SELECT lower(regexp_replace(product_name, '[^a-zA-Z0-9]', '', 'g'))
    $$;


--
-- Name: marketplace_products_set_norm_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marketplace_products_set_norm_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.norm_name := marketplace_product_compute_norm_name(NEW.product_name);
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
-- Name: protect_well_known_keyword(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_well_known_keyword() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND OLD.is_well_known THEN
        RAISE EXCEPTION 'Cannot delete well-known keyword "%"', OLD.name;
      END IF;
      IF TG_OP = 'UPDATE' THEN
        IF OLD.is_well_known AND NEW.name != OLD.name THEN
          RAISE EXCEPTION 'Cannot rename well-known keyword "%"', OLD.name;
        END IF;
        IF OLD.is_well_known AND NOT NEW.is_well_known THEN
          RAISE EXCEPTION 'Cannot unmark well-known keyword "%"', OLD.name;
        END IF;
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$;


--
-- Name: rebalance_friend_group_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rebalance_friend_group_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      successor RECORD;
    BEGIN
      IF OLD.role <> 'owner' THEN
        RETURN OLD;
      END IF;

      SELECT user_id INTO successor
      FROM friend_group_members
      WHERE group_id = OLD.group_id
      ORDER BY (role = 'admin') DESC, joined_at ASC
      LIMIT 1;

      IF FOUND THEN
        UPDATE friend_group_members
           SET role = 'owner'
         WHERE group_id = OLD.group_id AND user_id = successor.user_id;
      ELSE
        DELETE FROM friend_groups WHERE id = OLD.group_id;
      END IF;

      RETURN OLD;
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
-- Name: touch_list_on_entry_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_list_on_entry_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      UPDATE lists SET updated_at = now()
      WHERE id = COALESCE(NEW.list_id, OLD.list_id);
      RETURN NULL;
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
    id uuid DEFAULT uuidv7() NOT NULL,
    provider text NOT NULL,
    short_code text,
    external_id text NOT NULL,
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
    submitted_by_user_id text,
    submission_note text,
    CONSTRAINT candidate_cards_submission_note_check CHECK ((submission_note <> ''::text)),
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
    id uuid DEFAULT uuidv7() NOT NULL,
    candidate_card_id uuid NOT NULL,
    short_code text NOT NULL,
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_id uuid,
    external_id text NOT NULL,
    language text,
    printed_name text,
    marker_slugs text[] DEFAULT '{}'::text[] NOT NULL,
    size text,
    distribution_channel_slugs text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT candidate_printings_size_check CHECK ((size <> ''::text)),
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
-- Name: card_custom_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_custom_tags (
    card_id uuid NOT NULL,
    custom_tag_id uuid NOT NULL
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
    card_id uuid NOT NULL,
    norm_name text NOT NULL
);


--
-- Name: card_sizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_sizes (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL
);


--
-- Name: card_super_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_super_types (
    card_id uuid NOT NULL,
    super_type_slug text NOT NULL
);


--
-- Name: card_trade_copies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_trade_copies (
    trade_id uuid NOT NULL,
    copy_id uuid NOT NULL
);


--
-- Name: card_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_trades (
    id uuid DEFAULT uuidv7() NOT NULL,
    group_id uuid NOT NULL,
    giver_user_id text NOT NULL,
    receiver_user_id text NOT NULL,
    initiator text NOT NULL,
    printing_id uuid NOT NULL,
    card_id uuid NOT NULL,
    quantity integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    receiver_wish_entry_id uuid,
    last_actor_user_id text,
    giver_sync_applied_at timestamp with time zone,
    receiver_sync_applied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    completed_at timestamp with time zone,
    closed_at timestamp with time zone,
    expires_at timestamp with time zone,
    request_email_sent_at timestamp with time zone,
    reserved_email_sent_at timestamp with time zone,
    closed_email_sent_at timestamp with time zone,
    CONSTRAINT chk_card_trades_distinct_parties CHECK ((giver_user_id <> receiver_user_id)),
    CONSTRAINT chk_card_trades_initiator CHECK ((initiator = ANY (ARRAY['giver'::text, 'receiver'::text]))),
    CONSTRAINT chk_card_trades_quantity CHECK ((quantity > 0)),
    CONSTRAINT chk_card_trades_status CHECK ((status = ANY (ARRAY['pending'::text, 'reserved'::text, 'completed'::text, 'declined'::text, 'cancelled'::text, 'expired'::text])))
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
    id uuid DEFAULT uuidv7() NOT NULL,
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
-- Name: collection_deckbuilding_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_deckbuilding_prefs (
    user_id text NOT NULL,
    collection_id uuid NOT NULL,
    available boolean NOT NULL
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
    CONSTRAINT chk_collection_events_collection_presence CHECK ((((action = 'added'::text) AND ((to_collection_id IS NOT NULL) OR (to_collection_name IS NOT NULL))) OR ((action = 'removed'::text) AND ((from_collection_id IS NOT NULL) OR (from_collection_name IS NOT NULL))) OR ((action = 'moved'::text) AND ((from_collection_id IS NOT NULL) OR (from_collection_name IS NOT NULL)) AND ((to_collection_id IS NOT NULL) OR (to_collection_name IS NOT NULL)))))
);


--
-- Name: collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text,
    name text NOT NULL,
    description text,
    is_inbox boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    share_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    group_id uuid,
    CONSTRAINT chk_collections_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_collections_no_group_inbox CHECK (((group_id IS NULL) OR (is_inbox = false))),
    CONSTRAINT chk_collections_ownership CHECK (((((user_id IS NOT NULL))::integer + ((group_id IS NOT NULL))::integer) = 1))
);


--
-- Name: copies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copies (
    id uuid DEFAULT uuidv7() NOT NULL,
    collection_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_id uuid NOT NULL
);


--
-- Name: custom_tag_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_tag_categories (
    id uuid DEFAULT uuidv7() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_tag_categories_description_check CHECK ((description <> ''::text)),
    CONSTRAINT custom_tag_categories_label_check CHECK ((label <> ''::text)),
    CONSTRAINT custom_tag_categories_slug_check CHECK ((slug <> ''::text))
);


--
-- Name: custom_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_tags (
    id uuid DEFAULT uuidv7() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category_id uuid NOT NULL,
    CONSTRAINT custom_tags_description_check CHECK ((description <> ''::text)),
    CONSTRAINT custom_tags_label_check CHECK ((label <> ''::text)),
    CONSTRAINT custom_tags_slug_check CHECK ((slug <> ''::text))
);


--
-- Name: deck_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_cards (
    id uuid DEFAULT uuidv7() NOT NULL,
    deck_id uuid NOT NULL,
    zone text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    card_id uuid NOT NULL,
    preferred_printing_id uuid,
    CONSTRAINT chk_deck_cards_quantity CHECK ((quantity > 0))
);


--
-- Name: deck_check_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_check_entries (
    id uuid DEFAULT uuidv7() NOT NULL,
    external_id text NOT NULL,
    submitted_at timestamp with time zone,
    content_hash text NOT NULL,
    checked_by text,
    checked_at timestamp with time zone,
    notes text,
    change_summary jsonb,
    withdrawn_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    player_message text,
    allow_name_sharing boolean DEFAULT true NOT NULL,
    allow_riot_id_sharing boolean DEFAULT true NOT NULL,
    state text DEFAULT 'submitted'::text NOT NULL,
    review_outcome text,
    approved_by text,
    approved_at timestamp with time zone,
    unlock_requested_at timestamp with time zone,
    pre_edit_lines jsonb,
    allow_deck_publishing boolean DEFAULT true NOT NULL,
    tournament_id uuid NOT NULL,
    participant_id uuid,
    CONSTRAINT chk_deck_check_entries_notes CHECK (((notes IS NULL) OR (length(notes) <= 4000))),
    CONSTRAINT chk_deck_check_entries_player_message CHECK (((player_message IS NULL) OR (length(player_message) <= 2000))),
    CONSTRAINT chk_deck_check_entries_review_outcome CHECK (((review_outcome IS NULL) OR (review_outcome = ANY (ARRAY['ok'::text, 'issue'::text])))),
    CONSTRAINT chk_deck_check_entries_state CHECK ((state = ANY (ARRAY['editable'::text, 'submitted'::text, 'approved'::text, 'checked'::text, 'withdrawn'::text])))
);


--
-- Name: deck_check_entry_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_check_entry_cards (
    id uuid DEFAULT uuidv7() NOT NULL,
    entry_id uuid NOT NULL,
    sort_order integer NOT NULL,
    raw_name text NOT NULL,
    section text NOT NULL,
    zone text NOT NULL,
    quantity integer NOT NULL,
    resolved_card_id uuid,
    resolved_printing_id uuid,
    match_status text NOT NULL,
    found_copies boolean[] DEFAULT '{}'::boolean[] NOT NULL,
    CONSTRAINT chk_deck_check_entry_cards_found CHECK ((cardinality(found_copies) <= quantity)),
    CONSTRAINT chk_deck_check_entry_cards_match CHECK ((match_status = ANY (ARRAY['matched'::text, 'ambiguous'::text, 'unmatched'::text]))),
    CONSTRAINT chk_deck_check_entry_cards_quantity CHECK ((quantity > 0))
);


--
-- Name: deck_check_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_check_keys (
    id uuid DEFAULT uuidv7() NOT NULL,
    token_hash text NOT NULL,
    token_prefix text NOT NULL,
    label text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    host_type text NOT NULL,
    host_user_id text,
    host_org_id uuid,
    CONSTRAINT chk_deck_check_keys_host CHECK ((((host_type = 'user'::text) AND (host_user_id IS NOT NULL) AND (host_org_id IS NULL)) OR ((host_type = 'organization'::text) AND (host_org_id IS NOT NULL) AND (host_user_id IS NULL)))),
    CONSTRAINT chk_deck_check_keys_label CHECK (((label IS NULL) OR (length(label) <= 120)))
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
-- Name: deck_matchup_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_matchup_plans (
    id uuid DEFAULT uuidv7() NOT NULL,
    deck_id uuid NOT NULL,
    opponent_card_id uuid,
    notes text DEFAULT ''::text NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    opponent_label text DEFAULT ''::text NOT NULL,
    CONSTRAINT chk_deck_matchup_plans_identity CHECK (((opponent_card_id IS NOT NULL) OR (opponent_label <> ''::text))),
    CONSTRAINT chk_deck_matchup_plans_label CHECK ((length(opponent_label) <= 120)),
    CONSTRAINT chk_deck_matchup_plans_notes CHECK ((length(notes) <= 4000))
);


--
-- Name: deck_matchup_swaps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_matchup_swaps (
    id uuid DEFAULT uuidv7() NOT NULL,
    plan_id uuid NOT NULL,
    card_id uuid NOT NULL,
    direction text NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT chk_deck_matchup_swaps_direction CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT chk_deck_matchup_swaps_quantity CHECK ((quantity > 0))
);


--
-- Name: deck_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_plans (
    id uuid DEFAULT uuidv7() NOT NULL,
    deck_id uuid NOT NULL,
    general_strategy text DEFAULT ''::text NOT NULL,
    mulligan_split boolean DEFAULT false NOT NULL,
    mulligan_general text DEFAULT ''::text NOT NULL,
    mulligan_first text DEFAULT ''::text NOT NULL,
    mulligan_second text DEFAULT ''::text NOT NULL,
    battlefield_g1_card_id uuid,
    battlefield_first_card_id uuid,
    battlefield_second_card_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    battlefield_custom boolean DEFAULT false NOT NULL,
    battlefield_note text DEFAULT ''::text NOT NULL,
    CONSTRAINT chk_deck_plans_battlefield_note CHECK ((length(battlefield_note) <= 4000)),
    CONSTRAINT chk_deck_plans_general_strategy CHECK ((length(general_strategy) <= 8000)),
    CONSTRAINT chk_deck_plans_mulligan_first CHECK ((length(mulligan_first) <= 4000)),
    CONSTRAINT chk_deck_plans_mulligan_general CHECK ((length(mulligan_general) <= 4000)),
    CONSTRAINT chk_deck_plans_mulligan_second CHECK ((length(mulligan_second) <= 4000))
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
    is_pinned boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    format_config jsonb,
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
-- Name: friend_group_collection_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_group_collection_shares (
    group_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    user_id text NOT NULL,
    shared_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: friend_group_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_group_invites (
    id uuid DEFAULT uuidv7() NOT NULL,
    group_id uuid NOT NULL,
    user_id text NOT NULL,
    direction text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_friend_group_invites_direction CHECK ((direction = ANY (ARRAY['invite'::text, 'request'::text])))
);


--
-- Name: friend_group_list_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_group_list_shares (
    group_id uuid NOT NULL,
    list_id uuid NOT NULL,
    user_id text NOT NULL,
    shared_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: friend_group_member_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_group_member_contacts (
    group_id uuid NOT NULL,
    user_id text NOT NULL,
    contact_method_id uuid NOT NULL
);


--
-- Name: friend_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_group_members (
    group_id uuid NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_friend_group_members_role CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);


--
-- Name: friend_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_groups (
    id uuid DEFAULT uuidv7() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    code text,
    code_rotated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_friend_groups_description CHECK (((description IS NULL) OR (length(description) <= 500))),
    CONSTRAINT chk_friend_groups_name CHECK (((length(name) >= 1) AND (length(name) <= 60))),
    CONSTRAINT chk_friend_groups_slug CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{2,29}$'::text))
);


--
-- Name: ignored_candidate_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ignored_candidate_cards (
    id uuid DEFAULT uuidv7() NOT NULL,
    provider text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_ignored_candidate_cards_external_id_not_empty CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_ignored_candidate_cards_provider_not_empty CHECK ((provider <> ''::text))
);


--
-- Name: ignored_candidate_printings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ignored_candidate_printings (
    id uuid DEFAULT uuidv7() NOT NULL,
    provider text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
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
    needs_trim boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_image_files_has_url CHECK (((original_url IS NOT NULL) OR (rehosted_url IS NOT NULL))),
    CONSTRAINT chk_image_files_original_url CHECK ((original_url <> ''::text)),
    CONSTRAINT chk_image_files_rehosted_url CHECK ((rehosted_url <> ''::text)),
    CONSTRAINT chk_image_files_rotation CHECK ((rotation = ANY (ARRAY[0, 90, 180, 270])))
);


--
-- Name: job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    trigger text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    duration_ms integer,
    error_message text,
    result jsonb,
    noop boolean,
    CONSTRAINT chk_job_runs_status CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text]))),
    CONSTRAINT chk_job_runs_trigger CHECK ((trigger = ANY (ARRAY['cron'::text, 'admin'::text, 'api'::text])))
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
-- Name: keywords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.keywords (
    name text CONSTRAINT keyword_styles_name_not_null NOT NULL,
    color text CONSTRAINT keyword_styles_color_not_null NOT NULL,
    dark_text boolean DEFAULT false CONSTRAINT keyword_styles_dark_text_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT keyword_styles_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT keyword_styles_updated_at_not_null NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL,
    CONSTRAINT keywords_color_check CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text)),
    CONSTRAINT keywords_name_check CHECK ((name <> ''::text))
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
-- Name: list_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.list_entries (
    id uuid DEFAULT uuidv7() NOT NULL,
    list_id uuid NOT NULL,
    user_id text NOT NULL,
    card_id uuid,
    printing_id uuid,
    copy_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    price_pref text,
    price_absolute_cents integer,
    trade_type text,
    CONSTRAINT chk_list_entries_absolute_positive CHECK (((price_absolute_cents IS NULL) OR (price_absolute_cents > 0))),
    CONSTRAINT chk_list_entries_absolute_shape CHECK (((price_pref = 'absolute'::text) = (price_absolute_cents IS NOT NULL))),
    CONSTRAINT chk_list_entries_kind CHECK ((kind = ANY (ARRAY['card'::text, 'printing'::text, 'copy'::text]))),
    CONSTRAINT chk_list_entries_kind_shape CHECK ((((kind = 'card'::text) AND (card_id IS NOT NULL) AND (printing_id IS NULL) AND (copy_id IS NULL)) OR ((kind = 'printing'::text) AND (printing_id IS NOT NULL) AND (card_id IS NULL) AND (copy_id IS NULL)) OR ((kind = 'copy'::text) AND (copy_id IS NOT NULL) AND (card_id IS NULL) AND (printing_id IS NULL)))),
    CONSTRAINT chk_list_entries_price_pref CHECK (((price_pref IS NULL) OR (price_pref = ANY (ARRAY['cm_lowest'::text, 'tcg_lowest'::text, 'ct_zero'::text, 'absolute'::text])))),
    CONSTRAINT chk_list_entries_quantity CHECK ((quantity > 0)),
    CONSTRAINT chk_list_entries_trade_type CHECK (((trade_type IS NULL) OR (trade_type = ANY (ARRAY['cards'::text, 'money'::text, 'both'::text]))))
);


--
-- Name: lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lists (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    intent text NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    share_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    default_price_pref text,
    default_price_absolute_cents integer,
    default_trade_type text,
    currency text,
    sort_order integer DEFAULT 0 NOT NULL,
    rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT chk_lists_currency CHECK (((currency IS NULL) OR (currency = ANY (ARRAY['EUR'::text, 'USD'::text])))),
    CONSTRAINT chk_lists_default_absolute_positive CHECK (((default_price_absolute_cents IS NULL) OR (default_price_absolute_cents > 0))),
    CONSTRAINT chk_lists_default_absolute_shape CHECK (((default_price_pref = 'absolute'::text) = (default_price_absolute_cents IS NOT NULL))),
    CONSTRAINT chk_lists_default_price_pref CHECK (((default_price_pref IS NULL) OR (default_price_pref = ANY (ARRAY['cm_lowest'::text, 'tcg_lowest'::text, 'ct_zero'::text, 'absolute'::text])))),
    CONSTRAINT chk_lists_default_trade_type CHECK (((default_trade_type IS NULL) OR (default_trade_type = ANY (ARRAY['cards'::text, 'money'::text, 'both'::text])))),
    CONSTRAINT chk_lists_intent CHECK ((intent = ANY (ARRAY['wish'::text, 'trade'::text, 'organize'::text]))),
    CONSTRAINT chk_lists_intent_kind CHECK ((((intent = 'wish'::text) AND (kind = ANY (ARRAY['card'::text, 'printing'::text]))) OR ((intent = 'trade'::text) AND (kind = 'copy'::text)) OR ((intent = 'organize'::text) AND (kind = ANY (ARRAY['card'::text, 'printing'::text, 'copy'::text]))))),
    CONSTRAINT chk_lists_kind CHECK ((kind = ANY (ARRAY['card'::text, 'printing'::text, 'copy'::text]))),
    CONSTRAINT chk_lists_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_lists_prefs_only_on_trade_intents CHECK (((intent = ANY (ARRAY['wish'::text, 'trade'::text])) OR ((default_price_pref IS NULL) AND (default_price_absolute_cents IS NULL) AND (default_trade_type IS NULL) AND (currency IS NULL)))),
    CONSTRAINT chk_lists_rules_intent CHECK (((jsonb_array_length(rules) = 0) OR (intent = ANY (ARRAY['wish'::text, 'trade'::text]))))
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
    id uuid DEFAULT uuidv7() NOT NULL,
    group_kind public.marketplace_group_kind DEFAULT 'basic'::public.marketplace_group_kind NOT NULL,
    set_id uuid
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
    product_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketplace_product_card_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_product_card_overrides (
    created_at timestamp with time zone DEFAULT now() CONSTRAINT marketplace_staging_card_overrides_created_at_not_null NOT NULL,
    card_id uuid CONSTRAINT marketplace_staging_card_overrides_card_id_not_null NOT NULL,
    marketplace_product_id uuid CONSTRAINT marketplace_staging_card_overri_marketplace_product_id_not_null NOT NULL
);


--
-- Name: marketplace_product_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_product_prices (
    marketplace_product_id uuid NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    market_cents integer,
    low_cents integer,
    mid_cents integer,
    high_cents integer,
    trend_cents integer,
    avg1_cents integer,
    avg7_cents integer,
    avg30_cents integer,
    zero_low_cents integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_marketplace_product_prices_avg1_cents_non_negative CHECK ((avg1_cents >= 0)),
    CONSTRAINT chk_marketplace_product_prices_avg30_cents_non_negative CHECK ((avg30_cents >= 0)),
    CONSTRAINT chk_marketplace_product_prices_avg7_cents_non_negative CHECK ((avg7_cents >= 0)),
    CONSTRAINT chk_marketplace_product_prices_high_cents_non_negative CHECK ((high_cents >= 0)),
    CONSTRAINT chk_marketplace_product_prices_low_cents_non_negative CHECK ((low_cents >= 0)),
    CONSTRAINT chk_marketplace_product_prices_market_cents_non_negative CHECK ((market_cents >= 0)),
    CONSTRAINT chk_marketplace_product_prices_mid_cents_non_negative CHECK ((mid_cents >= 0)),
    CONSTRAINT chk_marketplace_product_prices_trend_cents_non_negative CHECK ((trend_cents >= 0)),
    CONSTRAINT chk_marketplace_product_prices_zero_low_cents_non_negative CHECK ((zero_low_cents >= 0))
);


--
-- Name: marketplace_product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_product_variants (
    id uuid DEFAULT uuidv7() NOT NULL,
    marketplace_product_id uuid NOT NULL,
    printing_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketplace_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_products (
    marketplace text NOT NULL,
    external_id integer NOT NULL,
    group_id integer NOT NULL,
    product_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT uuidv7() NOT NULL,
    finish text NOT NULL,
    language text,
    norm_name text DEFAULT ''::text NOT NULL,
    CONSTRAINT chk_marketplace_products_external_id_positive CHECK ((external_id > 0)),
    CONSTRAINT chk_marketplace_products_marketplace_not_empty CHECK ((marketplace <> ''::text)),
    CONSTRAINT chk_marketplace_products_product_name_not_empty CHECK ((product_name <> ''::text))
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
-- Name: mv_latest_printing_prices; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_latest_printing_prices AS
 SELECT DISTINCT ON (mpv.printing_id, mp.marketplace) mpv.printing_id,
    mp.marketplace,
        CASE
            WHEN (mp.marketplace = 'cardtrader'::text) THEN COALESCE(pp.zero_low_cents, pp.low_cents)
            WHEN (mp.marketplace = 'cardmarket'::text) THEN COALESCE(pp.low_cents, pp.market_cents)
            ELSE COALESCE(pp.market_cents, pp.low_cents)
        END AS headline_cents
   FROM ((public.marketplace_product_variants mpv
     JOIN public.marketplace_products mp ON ((mp.id = mpv.marketplace_product_id)))
     JOIN public.marketplace_product_prices pp ON ((pp.marketplace_product_id = mp.id)))
  WHERE (
        CASE
            WHEN (mp.marketplace = 'cardtrader'::text) THEN COALESCE(pp.zero_low_cents, pp.low_cents)
            WHEN (mp.marketplace = 'cardmarket'::text) THEN COALESCE(pp.low_cents, pp.market_cents)
            ELSE COALESCE(pp.market_cents, pp.low_cents)
        END IS NOT NULL)
  ORDER BY mpv.printing_id, mp.marketplace, (pp.zero_low_cents IS NULL), pp.recorded_at DESC
  WITH NO DATA;


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    org_id uuid NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_organization_members_role CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'judge'::text])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT uuidv7() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    owner_user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_organizations_description CHECK (((description IS NULL) OR (length(description) <= 4000))),
    CONSTRAINT chk_organizations_name CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT chk_organizations_slug CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'::text))
);


--
-- Name: pod_byes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_byes (
    round_id uuid NOT NULL,
    player_id uuid NOT NULL
);


--
-- Name: pod_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_members (
    pod_id uuid NOT NULL,
    player_id uuid NOT NULL,
    placement integer,
    game_points integer,
    CONSTRAINT chk_pod_members_game_points CHECK (((game_points IS NULL) OR (game_points >= 0))),
    CONSTRAINT chk_pod_members_placement CHECK (((placement IS NULL) OR ((placement >= 1) AND (placement <= 4))))
);


--
-- Name: pod_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_rounds (
    id uuid DEFAULT uuidv7() NOT NULL,
    tournament_id uuid NOT NULL,
    round_number integer NOT NULL,
    status text DEFAULT 'reporting'::text NOT NULL,
    penalty_total double precision NOT NULL,
    pairing_strategy text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finalized_at timestamp with time zone,
    CONSTRAINT chk_pod_rounds_number CHECK ((round_number > 0)),
    CONSTRAINT chk_pod_rounds_status CHECK ((status = ANY (ARRAY['reporting'::text, 'finalized'::text])))
);


--
-- Name: pods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pods (
    id uuid DEFAULT uuidv7() NOT NULL,
    round_id uuid NOT NULL,
    pod_number integer NOT NULL,
    size integer NOT NULL,
    penalty_breakdown jsonb NOT NULL,
    result_status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT chk_pods_number CHECK ((pod_number > 0)),
    CONSTRAINT chk_pods_result_status CHECK ((result_status = ANY (ARRAY['pending'::text, 'reported'::text]))),
    CONSTRAINT chk_pods_size CHECK ((size = ANY (ARRAY[3, 4])))
);


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
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_id uuid NOT NULL,
    image_file_id uuid CONSTRAINT printing_images_card_image_id_not_null NOT NULL,
    CONSTRAINT chk_printing_images_face CHECK ((face = ANY (ARRAY['front'::text, 'back'::text])))
);


--
-- Name: printing_link_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_link_overrides (
    external_id text NOT NULL,
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
-- Name: printings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printings (
    short_code text NOT NULL,
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
    id uuid DEFAULT uuidv7() NOT NULL,
    card_id uuid NOT NULL,
    set_id uuid NOT NULL,
    comment text,
    language text DEFAULT 'EN'::text NOT NULL,
    printed_name text,
    marker_slugs text[] DEFAULT '{}'::text[] NOT NULL,
    printed_year smallint,
    size text DEFAULT 'standard'::text NOT NULL,
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
    id uuid DEFAULT uuidv7() NOT NULL,
    set_type public.set_type DEFAULT 'main'::public.set_type NOT NULL,
    released boolean DEFAULT true NOT NULL,
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
    p.printed_year,
    p.size,
    (row_number() OVER (ORDER BY l.sort_order, s.sort_order, p.short_code, (array_length(p.marker_slugs, 1) IS NOT NULL), COALESCE(( SELECT min(m.sort_order) AS min
           FROM public.markers m
          WHERE (m.slug = ANY (p.marker_slugs))), 0), f.sort_order, cs.sort_order))::integer AS canonical_rank
   FROM ((((public.printings p
     JOIN public.sets s ON ((s.id = p.set_id)))
     JOIN public.finishes f ON ((f.slug = p.finish)))
     JOIN public.card_sizes cs ON ((cs.slug = p.size)))
     JOIN public.languages l ON ((l.code = p.language)));


--
-- Name: provider_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_settings (
    provider text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
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
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    comments text,
    CONSTRAINT rule_versions_kind_check CHECK ((kind = ANY (ARRAY['core'::text, 'tournament'::text])))
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
    kind text NOT NULL,
    CONSTRAINT rules_change_type_check CHECK ((change_type = ANY (ARRAY['added'::text, 'modified'::text, 'removed'::text]))),
    CONSTRAINT rules_depth_check CHECK (((depth >= 0) AND (depth <= 3))),
    CONSTRAINT rules_kind_check CHECK ((kind = ANY (ARRAY['core'::text, 'tournament'::text]))),
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
-- Name: tournament_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_participants (
    id uuid DEFAULT uuidv7() CONSTRAINT pod_players_id_not_null NOT NULL,
    tournament_id uuid CONSTRAINT pod_players_tournament_id_not_null NOT NULL,
    display_name text CONSTRAINT pod_players_display_name_not_null NOT NULL,
    status text DEFAULT 'active'::text CONSTRAINT pod_players_status_not_null NOT NULL,
    dropped_after_round integer,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT pod_players_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT pod_players_updated_at_not_null NOT NULL,
    user_id text,
    riot_id text,
    seed integer,
    claim_source text,
    claim_token text,
    claimed_at timestamp with time zone,
    claim_blocked_at timestamp with time zone,
    CONSTRAINT chk_tournament_participants_claim_source CHECK (((claim_source IS NULL) OR (claim_source = ANY (ARRAY['judge_manual'::text, 'self_submit'::text, 'claim_link'::text])))),
    CONSTRAINT chk_tournament_participants_name CHECK (((length(display_name) >= 1) AND (length(display_name) <= 120))),
    CONSTRAINT chk_tournament_participants_riot_id CHECK (((riot_id IS NULL) OR (length(riot_id) <= 120))),
    CONSTRAINT chk_tournament_participants_status CHECK ((status = ANY (ARRAY['requested'::text, 'invited'::text, 'active'::text, 'dropped'::text, 'no_show'::text])))
);


--
-- Name: tournament_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_staff (
    tournament_id uuid NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_tournament_staff_role CHECK ((role = ANY (ARRAY['organizer'::text, 'judge'::text])))
);


--
-- Name: tournaments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournaments (
    id uuid DEFAULT uuidv7() CONSTRAINT pod_tournaments_id_not_null NOT NULL,
    host_user_id text,
    name text CONSTRAINT pod_tournaments_name_not_null NOT NULL,
    status text DEFAULT 'setup'::text CONSTRAINT pod_tournaments_status_not_null NOT NULL,
    current_round integer DEFAULT 0 CONSTRAINT pod_tournaments_current_round_not_null NOT NULL,
    scoring_scheme text DEFAULT 'standard'::text CONSTRAINT pod_tournaments_scoring_scheme_not_null NOT NULL,
    report_token text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT pod_tournaments_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT pod_tournaments_updated_at_not_null NOT NULL,
    bye_points integer DEFAULT 3 CONSTRAINT pod_tournaments_bye_points_not_null NOT NULL,
    host_type text NOT NULL,
    host_org_id uuid,
    group_id uuid,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    pairing_style text DEFAULT 'pod'::text NOT NULL,
    deck_submission text DEFAULT 'none'::text NOT NULL,
    deck_phase text DEFAULT 'open'::text NOT NULL,
    submissions_close_at timestamp with time zone,
    list_lock_mode text DEFAULT 'on_submit'::text NOT NULL,
    deck_format text,
    allowed_sets jsonb,
    self_registration boolean DEFAULT false NOT NULL,
    submission_token text,
    ends_at timestamp with time zone,
    organizer_invite_token text,
    judge_invite_token text,
    follow_token text,
    CONSTRAINT chk_tournaments_bye_points CHECK ((bye_points >= 0)),
    CONSTRAINT chk_tournaments_deck_phase CHECK ((deck_phase = ANY (ARRAY['open'::text, 'closed'::text, 'locked'::text]))),
    CONSTRAINT chk_tournaments_deck_submission CHECK ((deck_submission = ANY (ARRAY['none'::text, 'optional'::text, 'required'::text]))),
    CONSTRAINT chk_tournaments_host CHECK ((((host_type = 'user'::text) AND (host_org_id IS NULL)) OR ((host_type = 'organization'::text) AND (host_user_id IS NULL)))),
    CONSTRAINT chk_tournaments_list_lock_mode CHECK ((list_lock_mode = ANY (ARRAY['on_submit'::text, 'at_deadline'::text]))),
    CONSTRAINT chk_tournaments_name CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT chk_tournaments_pairing_style CHECK ((pairing_style = ANY (ARRAY['none'::text, 'pod'::text]))),
    CONSTRAINT chk_tournaments_scheme CHECK ((scoring_scheme = ANY (ARRAY['standard'::text, 'three_pod_reduced'::text]))),
    CONSTRAINT chk_tournaments_status CHECK ((status = ANY (ARRAY['setup'::text, 'running'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: user_contact_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_contact_methods (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    value text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_user_contact_methods_type CHECK ((type = ANY (ARRAY['discord'::text, 'signal'::text, 'telegram'::text, 'whatsapp'::text, 'phone'::text, 'email'::text, 'in_person'::text, 'other'::text]))),
    CONSTRAINT chk_user_contact_methods_value CHECK (((length(value) >= 1) AND (length(value) <= 200)))
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    share_token text,
    riot_id text
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
-- Name: card_custom_tags card_custom_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_custom_tags
    ADD CONSTRAINT card_custom_tags_pkey PRIMARY KEY (card_id, custom_tag_id);


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
-- Name: card_sizes card_sizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_sizes
    ADD CONSTRAINT card_sizes_pkey PRIMARY KEY (slug);


--
-- Name: card_super_types card_super_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_super_types
    ADD CONSTRAINT card_super_types_pkey PRIMARY KEY (card_id, super_type_slug);


--
-- Name: card_trade_copies card_trade_copies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trade_copies
    ADD CONSTRAINT card_trade_copies_pkey PRIMARY KEY (trade_id, copy_id);


--
-- Name: card_trades card_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trades
    ADD CONSTRAINT card_trades_pkey PRIMARY KEY (id);


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
-- Name: collection_deckbuilding_prefs collection_deckbuilding_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_deckbuilding_prefs
    ADD CONSTRAINT collection_deckbuilding_prefs_pkey PRIMARY KEY (user_id, collection_id);


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
-- Name: custom_tag_categories custom_tag_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_tag_categories
    ADD CONSTRAINT custom_tag_categories_pkey PRIMARY KEY (id);


--
-- Name: custom_tag_categories custom_tag_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_tag_categories
    ADD CONSTRAINT custom_tag_categories_slug_key UNIQUE (slug);


--
-- Name: custom_tags custom_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_tags
    ADD CONSTRAINT custom_tags_pkey PRIMARY KEY (id);


--
-- Name: custom_tags custom_tags_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_tags
    ADD CONSTRAINT custom_tags_slug_key UNIQUE (slug);


--
-- Name: deck_cards deck_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_cards
    ADD CONSTRAINT deck_cards_pkey PRIMARY KEY (id);


--
-- Name: deck_check_entries deck_check_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entries
    ADD CONSTRAINT deck_check_entries_pkey PRIMARY KEY (id);


--
-- Name: deck_check_entry_cards deck_check_entry_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entry_cards
    ADD CONSTRAINT deck_check_entry_cards_pkey PRIMARY KEY (id);


--
-- Name: deck_check_keys deck_check_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_keys
    ADD CONSTRAINT deck_check_keys_pkey PRIMARY KEY (id);


--
-- Name: deck_check_keys deck_check_keys_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_keys
    ADD CONSTRAINT deck_check_keys_token_hash_key UNIQUE (token_hash);


--
-- Name: deck_formats deck_formats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_formats
    ADD CONSTRAINT deck_formats_pkey PRIMARY KEY (slug);


--
-- Name: deck_matchup_plans deck_matchup_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_matchup_plans
    ADD CONSTRAINT deck_matchup_plans_pkey PRIMARY KEY (id);


--
-- Name: deck_matchup_swaps deck_matchup_swaps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_matchup_swaps
    ADD CONSTRAINT deck_matchup_swaps_pkey PRIMARY KEY (id);


--
-- Name: deck_plans deck_plans_deck_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_plans
    ADD CONSTRAINT deck_plans_deck_id_key UNIQUE (deck_id);


--
-- Name: deck_plans deck_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_plans
    ADD CONSTRAINT deck_plans_pkey PRIMARY KEY (id);


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
-- Name: friend_group_collection_shares friend_group_collection_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_collection_shares
    ADD CONSTRAINT friend_group_collection_shares_pkey PRIMARY KEY (group_id, collection_id);


--
-- Name: friend_group_invites friend_group_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_invites
    ADD CONSTRAINT friend_group_invites_pkey PRIMARY KEY (id);


--
-- Name: friend_group_list_shares friend_group_list_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_list_shares
    ADD CONSTRAINT friend_group_list_shares_pkey PRIMARY KEY (group_id, list_id);


--
-- Name: friend_group_member_contacts friend_group_member_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_member_contacts
    ADD CONSTRAINT friend_group_member_contacts_pkey PRIMARY KEY (group_id, user_id, contact_method_id);


--
-- Name: friend_group_members friend_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_members
    ADD CONSTRAINT friend_group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: friend_groups friend_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_groups
    ADD CONSTRAINT friend_groups_pkey PRIMARY KEY (id);


--
-- Name: friend_groups friend_groups_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_groups
    ADD CONSTRAINT friend_groups_slug_key UNIQUE (slug);


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
-- Name: job_runs job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_runs
    ADD CONSTRAINT job_runs_pkey PRIMARY KEY (id);


--
-- Name: keywords keywords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keywords
    ADD CONSTRAINT keywords_pkey PRIMARY KEY (name);


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
-- Name: list_entries list_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_entries
    ADD CONSTRAINT list_entries_pkey PRIMARY KEY (id);


--
-- Name: lists lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_pkey PRIMARY KEY (id);


--
-- Name: lists lists_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_share_token_key UNIQUE (share_token);


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
    ADD CONSTRAINT marketplace_ignored_variants_pkey PRIMARY KEY (marketplace_product_id);


--
-- Name: marketplace_product_card_overrides marketplace_product_card_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_card_overrides
    ADD CONSTRAINT marketplace_product_card_overrides_pkey PRIMARY KEY (marketplace_product_id);


--
-- Name: marketplace_product_prices marketplace_product_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_prices
    ADD CONSTRAINT marketplace_product_prices_pkey PRIMARY KEY (marketplace_product_id, recorded_at);


--
-- Name: marketplace_product_variants marketplace_product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_variants
    ADD CONSTRAINT marketplace_product_variants_pkey PRIMARY KEY (id);


--
-- Name: marketplace_products marketplace_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_sources_pkey PRIMARY KEY (id);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (org_id, user_id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: pod_byes pod_byes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_byes
    ADD CONSTRAINT pod_byes_pkey PRIMARY KEY (round_id, player_id);


--
-- Name: pod_members pod_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_members
    ADD CONSTRAINT pod_members_pkey PRIMARY KEY (pod_id, player_id);


--
-- Name: pod_rounds pod_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_rounds
    ADD CONSTRAINT pod_rounds_pkey PRIMARY KEY (id);


--
-- Name: pods pods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pods
    ADD CONSTRAINT pods_pkey PRIMARY KEY (id);


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
    ADD CONSTRAINT rule_versions_pkey PRIMARY KEY (kind, version);


--
-- Name: rules rules_kind_version_rule_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_kind_version_rule_number_key UNIQUE (kind, version, rule_number);


--
-- Name: rules rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_pkey PRIMARY KEY (id);


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
-- Name: tournament_participants tournament_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_participants
    ADD CONSTRAINT tournament_participants_pkey PRIMARY KEY (id);


--
-- Name: tournament_staff tournament_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_staff
    ADD CONSTRAINT tournament_staff_pkey PRIMARY KEY (tournament_id, user_id, role);


--
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);


--
-- Name: card_trade_copies uq_card_trade_copies_copy; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trade_copies
    ADD CONSTRAINT uq_card_trade_copies_copy UNIQUE (copy_id);


--
-- Name: collections uq_collections_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT uq_collections_id_user UNIQUE (id, user_id);


--
-- Name: deck_check_entries uq_deck_check_entries_tournament_external; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entries
    ADD CONSTRAINT uq_deck_check_entries_tournament_external UNIQUE (tournament_id, external_id);


--
-- Name: deck_matchup_swaps uq_deck_matchup_swaps_plan_card_direction; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_matchup_swaps
    ADD CONSTRAINT uq_deck_matchup_swaps_plan_card_direction UNIQUE (plan_id, card_id, direction);


--
-- Name: decks uq_decks_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT uq_decks_id_user UNIQUE (id, user_id);


--
-- Name: friend_group_invites uq_friend_group_invites_group_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_invites
    ADD CONSTRAINT uq_friend_group_invites_group_user UNIQUE (group_id, user_id);


--
-- Name: friend_group_members uq_friend_group_members_user_group; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_members
    ADD CONSTRAINT uq_friend_group_members_user_group UNIQUE (user_id, group_id);


--
-- Name: keyword_translations uq_keyword_translations_keyword_language; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_translations
    ADD CONSTRAINT uq_keyword_translations_keyword_language UNIQUE (keyword_name, language);


--
-- Name: lists uq_lists_id_kind; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT uq_lists_id_kind UNIQUE (id, kind);


--
-- Name: lists uq_lists_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT uq_lists_id_user UNIQUE (id, user_id);


--
-- Name: pod_rounds uq_pod_rounds_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_rounds
    ADD CONSTRAINT uq_pod_rounds_number UNIQUE (tournament_id, round_number);


--
-- Name: pods uq_pods_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pods
    ADD CONSTRAINT uq_pods_number UNIQUE (round_id, pod_number);


--
-- Name: printings uq_printings_identity; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT uq_printings_identity UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, marker_slugs, language, size) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: printings uq_printings_variant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT uq_printings_variant UNIQUE (short_code, art_variant, is_signed, marker_slugs, rarity, finish, language, size) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: user_contact_methods user_contact_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_contact_methods
    ADD CONSTRAINT user_contact_methods_pkey PRIMARY KEY (id);


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
-- Name: idx_candidate_cards_submitted_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candidate_cards_submitted_by_user_id ON public.candidate_cards USING btree (submitted_by_user_id) WHERE (submitted_by_user_id IS NOT NULL);


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
-- Name: idx_card_custom_tags_custom_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_custom_tags_custom_tag_id ON public.card_custom_tags USING btree (custom_tag_id);


--
-- Name: idx_card_domains_domain_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_domains_domain_slug ON public.card_domains USING btree (domain_slug);


--
-- Name: idx_card_trades_closed_email_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_trades_closed_email_pending ON public.card_trades USING btree (updated_at) WHERE ((closed_email_sent_at IS NULL) AND (status = ANY (ARRAY['declined'::text, 'cancelled'::text])));


--
-- Name: idx_card_trades_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_trades_expiry ON public.card_trades USING btree (expires_at) WHERE (status = 'pending'::text);


--
-- Name: idx_card_trades_giver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_trades_giver ON public.card_trades USING btree (giver_user_id, status);


--
-- Name: idx_card_trades_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_trades_group ON public.card_trades USING btree (group_id, status);


--
-- Name: idx_card_trades_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_trades_receiver ON public.card_trades USING btree (receiver_user_id, status);


--
-- Name: idx_card_trades_receiver_wish_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_trades_receiver_wish_entry ON public.card_trades USING btree (receiver_wish_entry_id) WHERE (receiver_wish_entry_id IS NOT NULL);


--
-- Name: idx_card_trades_request_email_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_trades_request_email_pending ON public.card_trades USING btree (created_at) WHERE ((request_email_sent_at IS NULL) AND (status = 'pending'::text));


--
-- Name: idx_card_trades_reserved_email_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_trades_reserved_email_pending ON public.card_trades USING btree (updated_at) WHERE ((reserved_email_sent_at IS NULL) AND (status = 'reserved'::text));


--
-- Name: idx_cards_norm_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cards_norm_name ON public.cards USING btree (norm_name);


--
-- Name: idx_collection_deckbuilding_prefs_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_deckbuilding_prefs_collection ON public.collection_deckbuilding_prefs USING btree (collection_id);


--
-- Name: idx_collection_events_copy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_events_copy ON public.collection_events USING btree (copy_id);


--
-- Name: idx_collection_events_from_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_events_from_collection ON public.collection_events USING btree (from_collection_id) WHERE (from_collection_id IS NOT NULL);


--
-- Name: idx_collection_events_to_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_events_to_collection ON public.collection_events USING btree (to_collection_id) WHERE (to_collection_id IS NOT NULL);


--
-- Name: idx_collection_events_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_events_user_created ON public.collection_events USING btree (user_id, created_at);


--
-- Name: idx_collections_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collections_group ON public.collections USING btree (group_id);


--
-- Name: idx_collections_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collections_user_id ON public.collections USING btree (user_id);


--
-- Name: idx_copies_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_collection ON public.copies USING btree (collection_id);


--
-- Name: idx_copies_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_printing ON public.copies USING btree (printing_id);


--
-- Name: idx_custom_tags_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_tags_category_id ON public.custom_tags USING btree (category_id);


--
-- Name: idx_deck_cards_deck; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_cards_deck ON public.deck_cards USING btree (deck_id);


--
-- Name: idx_deck_check_entries_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_check_entries_participant ON public.deck_check_entries USING btree (participant_id) WHERE (participant_id IS NOT NULL);


--
-- Name: idx_deck_check_entry_cards_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_check_entry_cards_entry ON public.deck_check_entry_cards USING btree (entry_id);


--
-- Name: idx_deck_check_keys_host_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_check_keys_host_org ON public.deck_check_keys USING btree (host_org_id) WHERE (host_org_id IS NOT NULL);


--
-- Name: idx_deck_check_keys_host_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_check_keys_host_user ON public.deck_check_keys USING btree (host_user_id) WHERE (host_user_id IS NOT NULL);


--
-- Name: idx_deck_matchup_plans_deck; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_matchup_plans_deck ON public.deck_matchup_plans USING btree (deck_id);


--
-- Name: idx_deck_matchup_swaps_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_matchup_swaps_plan ON public.deck_matchup_swaps USING btree (plan_id);


--
-- Name: idx_decks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decks_user_id ON public.decks USING btree (user_id);


--
-- Name: idx_distribution_channels_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distribution_channels_parent_id ON public.distribution_channels USING btree (parent_id);


--
-- Name: idx_friend_group_collection_shares_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_group_collection_shares_collection ON public.friend_group_collection_shares USING btree (collection_id);


--
-- Name: idx_friend_group_collection_shares_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_group_collection_shares_group ON public.friend_group_collection_shares USING btree (group_id);


--
-- Name: idx_friend_group_invites_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_group_invites_user ON public.friend_group_invites USING btree (user_id);


--
-- Name: idx_friend_group_list_shares_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_group_list_shares_group ON public.friend_group_list_shares USING btree (group_id);


--
-- Name: idx_friend_group_list_shares_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_group_list_shares_list ON public.friend_group_list_shares USING btree (list_id);


--
-- Name: idx_friend_group_member_contacts_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_group_member_contacts_member ON public.friend_group_member_contacts USING btree (group_id, user_id);


--
-- Name: idx_friend_group_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_group_members_user ON public.friend_group_members USING btree (user_id);


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
-- Name: idx_job_runs_kind_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_runs_kind_started_at ON public.job_runs USING btree (kind, started_at DESC);


--
-- Name: idx_job_runs_running; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_runs_running ON public.job_runs USING btree (kind) WHERE (status = 'running'::text);


--
-- Name: idx_list_entries_copy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_list_entries_copy ON public.list_entries USING btree (copy_id) WHERE (copy_id IS NOT NULL);


--
-- Name: idx_list_entries_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_list_entries_list ON public.list_entries USING btree (list_id);


--
-- Name: idx_lists_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lists_user_id ON public.lists USING btree (user_id);


--
-- Name: idx_lists_user_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lists_user_intent ON public.lists USING btree (user_id, intent);


--
-- Name: idx_marketplace_product_variants_printing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_product_variants_printing_id ON public.marketplace_product_variants USING btree (printing_id);


--
-- Name: idx_marketplace_products_norm_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_products_norm_name_trgm ON public.marketplace_products USING gin (norm_name public.gin_trgm_ops);


--
-- Name: idx_mv_card_aggregates_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_card_aggregates_pk ON public.mv_card_aggregates USING btree (card_id);


--
-- Name: idx_mv_latest_printing_prices_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk ON public.mv_latest_printing_prices USING btree (printing_id, marketplace);


--
-- Name: idx_organization_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_user ON public.organization_members USING btree (user_id);


--
-- Name: idx_organizations_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_owner ON public.organizations USING btree (owner_user_id);


--
-- Name: idx_pod_byes_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_byes_player ON public.pod_byes USING btree (player_id);


--
-- Name: idx_pod_members_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_members_player ON public.pod_members USING btree (player_id);


--
-- Name: idx_pod_rounds_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_rounds_tournament ON public.pod_rounds USING btree (tournament_id);


--
-- Name: idx_pods_round; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pods_round ON public.pods USING btree (round_id);


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
-- Name: idx_printing_images_printing_face; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_images_printing_face ON public.printing_images USING btree (printing_id, face);


--
-- Name: idx_printing_images_printing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_images_printing_id ON public.printing_images USING btree (printing_id);


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
-- Name: idx_rules_kind_version_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rules_kind_version_sort ON public.rules USING btree (kind, version, sort_order);


--
-- Name: idx_sessions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sessions_token ON public.sessions USING btree (token);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id);


--
-- Name: idx_tournament_participants_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_participants_tournament ON public.tournament_participants USING btree (tournament_id);


--
-- Name: idx_tournament_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_participants_user ON public.tournament_participants USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_tournament_staff_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_staff_user ON public.tournament_staff USING btree (user_id);


--
-- Name: idx_tournaments_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_group ON public.tournaments USING btree (group_id) WHERE (group_id IS NOT NULL);


--
-- Name: idx_tournaments_host_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_host_org ON public.tournaments USING btree (host_org_id) WHERE (host_org_id IS NOT NULL);


--
-- Name: idx_tournaments_host_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_host_user ON public.tournaments USING btree (host_user_id) WHERE (host_user_id IS NOT NULL);


--
-- Name: idx_user_contact_methods_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_contact_methods_user ON public.user_contact_methods USING btree (user_id);


--
-- Name: marketplace_product_variants_product_printing_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_product_variants_product_printing_key ON public.marketplace_product_variants USING btree (marketplace_product_id, printing_id);


--
-- Name: marketplace_products_sku_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_products_sku_key ON public.marketplace_products USING btree (marketplace, external_id, finish, language) NULLS NOT DISTINCT;


--
-- Name: uq_card_bans_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_card_bans_active ON public.card_bans USING btree (card_id, format_id) WHERE (unbanned_at IS NULL);


--
-- Name: uq_card_trades_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_card_trades_live ON public.card_trades USING btree (group_id, giver_user_id, receiver_user_id, printing_id) WHERE (status = ANY (ARRAY['pending'::text, 'reserved'::text]));


--
-- Name: uq_collections_user_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_collections_user_inbox ON public.collections USING btree (user_id) WHERE (is_inbox = true);


--
-- Name: uq_deck_cards; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_deck_cards ON public.deck_cards USING btree (deck_id, card_id, zone, preferred_printing_id) NULLS NOT DISTINCT;


--
-- Name: uq_friend_group_one_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_friend_group_one_owner ON public.friend_group_members USING btree (group_id) WHERE (role = 'owner'::text);


--
-- Name: uq_friend_groups_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_friend_groups_code ON public.friend_groups USING btree (code) WHERE (code IS NOT NULL);


--
-- Name: uq_list_entries_card; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_list_entries_card ON public.list_entries USING btree (list_id, card_id) WHERE (card_id IS NOT NULL);


--
-- Name: uq_list_entries_copy; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_list_entries_copy ON public.list_entries USING btree (list_id, copy_id) WHERE (copy_id IS NOT NULL);


--
-- Name: uq_list_entries_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_list_entries_printing ON public.list_entries USING btree (list_id, printing_id) WHERE (printing_id IS NOT NULL);


--
-- Name: uq_tournament_participants_claim_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tournament_participants_claim_token ON public.tournament_participants USING btree (claim_token) WHERE (claim_token IS NOT NULL);


--
-- Name: uq_tournament_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tournament_participants_user ON public.tournament_participants USING btree (tournament_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: uq_tournaments_follow_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tournaments_follow_token ON public.tournaments USING btree (follow_token) WHERE (follow_token IS NOT NULL);


--
-- Name: uq_tournaments_judge_invite_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tournaments_judge_invite_token ON public.tournaments USING btree (judge_invite_token) WHERE (judge_invite_token IS NOT NULL);


--
-- Name: uq_tournaments_organizer_invite_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tournaments_organizer_invite_token ON public.tournaments USING btree (organizer_invite_token) WHERE (organizer_invite_token IS NOT NULL);


--
-- Name: uq_tournaments_report_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tournaments_report_token ON public.tournaments USING btree (report_token) WHERE (report_token IS NOT NULL);


--
-- Name: uq_tournaments_submission_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tournaments_submission_token ON public.tournaments USING btree (submission_token) WHERE (submission_token IS NOT NULL);


--
-- Name: uq_users_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_users_email_lower ON public.users USING btree (lower(email));


--
-- Name: uq_users_share_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_users_share_token ON public.users USING btree (share_token) WHERE (share_token IS NOT NULL);


--
-- Name: distribution_channels distribution_channels_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER distribution_channels_validate BEFORE INSERT OR UPDATE ON public.distribution_channels FOR EACH ROW EXECUTE FUNCTION public.trg_distribution_channels_validate();


--
-- Name: keywords keywords_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER keywords_set_updated_at BEFORE UPDATE ON public.keywords FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: card_sizes trg_card_sizes_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_card_sizes_protect_well_known BEFORE DELETE OR UPDATE ON public.card_sizes FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


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
-- Name: keywords trg_keywords_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_keywords_protect_well_known BEFORE DELETE OR UPDATE ON public.keywords FOR EACH ROW EXECUTE FUNCTION public.protect_well_known_keyword();


--
-- Name: marketplace_products trg_marketplace_products_set_norm_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_products_set_norm_name BEFORE INSERT OR UPDATE OF product_name ON public.marketplace_products FOR EACH ROW EXECUTE FUNCTION public.marketplace_products_set_norm_name();


--
-- Name: collections trg_prevent_nonempty_collection_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_nonempty_collection_delete BEFORE DELETE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.prevent_nonempty_collection_delete();


--
-- Name: rarities trg_rarities_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rarities_protect_well_known BEFORE DELETE OR UPDATE ON public.rarities FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: friend_group_members trg_rebalance_friend_group_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rebalance_friend_group_owner AFTER DELETE ON public.friend_group_members FOR EACH ROW EXECUTE FUNCTION public.rebalance_friend_group_owner();


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
-- Name: custom_tag_categories trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.custom_tag_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: custom_tags trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.custom_tags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: deck_cards trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.deck_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: deck_check_entries trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.deck_check_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: deck_matchup_plans trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.deck_matchup_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: deck_plans trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.deck_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: friend_groups trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.friend_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: list_entries trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.list_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lists trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: organizations trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: tournament_participants trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.tournament_participants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tournaments trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_contact_methods trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.user_contact_methods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: verifications trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.verifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: super_types trg_super_types_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_super_types_protect_well_known BEFORE DELETE OR UPDATE ON public.super_types FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: list_entries trg_touch_list_on_entry_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_list_on_entry_change AFTER INSERT OR DELETE OR UPDATE ON public.list_entries FOR EACH ROW EXECUTE FUNCTION public.touch_list_on_entry_change();


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
-- Name: candidate_cards candidate_cards_submitted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_cards
    ADD CONSTRAINT candidate_cards_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: card_custom_tags card_custom_tags_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_custom_tags
    ADD CONSTRAINT card_custom_tags_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;


--
-- Name: card_custom_tags card_custom_tags_custom_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_custom_tags
    ADD CONSTRAINT card_custom_tags_custom_tag_id_fkey FOREIGN KEY (custom_tag_id) REFERENCES public.custom_tags(id) ON DELETE CASCADE;


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
-- Name: card_trade_copies card_trade_copies_copy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trade_copies
    ADD CONSTRAINT card_trade_copies_copy_id_fkey FOREIGN KEY (copy_id) REFERENCES public.copies(id) ON DELETE CASCADE;


--
-- Name: card_trade_copies card_trade_copies_trade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trade_copies
    ADD CONSTRAINT card_trade_copies_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.card_trades(id) ON DELETE CASCADE;


--
-- Name: card_trades card_trades_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trades
    ADD CONSTRAINT card_trades_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: card_trades card_trades_giver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trades
    ADD CONSTRAINT card_trades_giver_user_id_fkey FOREIGN KEY (giver_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: card_trades card_trades_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trades
    ADD CONSTRAINT card_trades_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.friend_groups(id) ON DELETE CASCADE;


--
-- Name: card_trades card_trades_last_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trades
    ADD CONSTRAINT card_trades_last_actor_user_id_fkey FOREIGN KEY (last_actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: card_trades card_trades_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trades
    ADD CONSTRAINT card_trades_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: card_trades card_trades_receiver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trades
    ADD CONSTRAINT card_trades_receiver_user_id_fkey FOREIGN KEY (receiver_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: card_trades card_trades_receiver_wish_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trades
    ADD CONSTRAINT card_trades_receiver_wish_entry_id_fkey FOREIGN KEY (receiver_wish_entry_id) REFERENCES public.list_entries(id) ON DELETE SET NULL;


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
-- Name: collections collections_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.friend_groups(id) ON DELETE CASCADE;


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
-- Name: custom_tags custom_tags_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_tags
    ADD CONSTRAINT custom_tags_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.custom_tag_categories(id) ON DELETE RESTRICT;


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
-- Name: deck_check_entries deck_check_entries_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entries
    ADD CONSTRAINT deck_check_entries_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: deck_check_entries deck_check_entries_checked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entries
    ADD CONSTRAINT deck_check_entries_checked_by_fkey FOREIGN KEY (checked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: deck_check_entries deck_check_entries_participant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entries
    ADD CONSTRAINT deck_check_entries_participant_fkey FOREIGN KEY (participant_id) REFERENCES public.tournament_participants(id) ON DELETE CASCADE;


--
-- Name: deck_check_entries deck_check_entries_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entries
    ADD CONSTRAINT deck_check_entries_tournament_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: deck_check_entry_cards deck_check_entry_cards_card_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entry_cards
    ADD CONSTRAINT deck_check_entry_cards_card_fkey FOREIGN KEY (resolved_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: deck_check_entry_cards deck_check_entry_cards_entry_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entry_cards
    ADD CONSTRAINT deck_check_entry_cards_entry_fkey FOREIGN KEY (entry_id) REFERENCES public.deck_check_entries(id) ON DELETE CASCADE;


--
-- Name: deck_check_entry_cards deck_check_entry_cards_printing_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entry_cards
    ADD CONSTRAINT deck_check_entry_cards_printing_fkey FOREIGN KEY (resolved_printing_id) REFERENCES public.printings(id) ON DELETE SET NULL;


--
-- Name: deck_check_entry_cards deck_check_entry_cards_zone_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entry_cards
    ADD CONSTRAINT deck_check_entry_cards_zone_fkey FOREIGN KEY (zone) REFERENCES public.deck_zones(slug);


--
-- Name: deck_check_keys deck_check_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_keys
    ADD CONSTRAINT deck_check_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: deck_check_keys deck_check_keys_host_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_keys
    ADD CONSTRAINT deck_check_keys_host_org_fkey FOREIGN KEY (host_org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: deck_check_keys deck_check_keys_host_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_keys
    ADD CONSTRAINT deck_check_keys_host_user_fkey FOREIGN KEY (host_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: deck_matchup_plans deck_matchup_plans_card_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_matchup_plans
    ADD CONSTRAINT deck_matchup_plans_card_fkey FOREIGN KEY (opponent_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: deck_matchup_plans deck_matchup_plans_deck_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_matchup_plans
    ADD CONSTRAINT deck_matchup_plans_deck_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id) ON DELETE CASCADE;


--
-- Name: deck_matchup_swaps deck_matchup_swaps_card_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_matchup_swaps
    ADD CONSTRAINT deck_matchup_swaps_card_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;


--
-- Name: deck_matchup_swaps deck_matchup_swaps_plan_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_matchup_swaps
    ADD CONSTRAINT deck_matchup_swaps_plan_fkey FOREIGN KEY (plan_id) REFERENCES public.deck_matchup_plans(id) ON DELETE CASCADE;


--
-- Name: deck_plans deck_plans_battlefield_first_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_plans
    ADD CONSTRAINT deck_plans_battlefield_first_card_id_fkey FOREIGN KEY (battlefield_first_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: deck_plans deck_plans_battlefield_g1_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_plans
    ADD CONSTRAINT deck_plans_battlefield_g1_card_id_fkey FOREIGN KEY (battlefield_g1_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: deck_plans deck_plans_battlefield_second_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_plans
    ADD CONSTRAINT deck_plans_battlefield_second_card_id_fkey FOREIGN KEY (battlefield_second_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: deck_plans deck_plans_deck_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_plans
    ADD CONSTRAINT deck_plans_deck_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id) ON DELETE CASCADE;


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
-- Name: collection_deckbuilding_prefs fk_collection_deckbuilding_prefs_collection; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_deckbuilding_prefs
    ADD CONSTRAINT fk_collection_deckbuilding_prefs_collection FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;


--
-- Name: collection_deckbuilding_prefs fk_collection_deckbuilding_prefs_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_deckbuilding_prefs
    ADD CONSTRAINT fk_collection_deckbuilding_prefs_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: collection_events fk_collection_events_copy; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_events
    ADD CONSTRAINT fk_collection_events_copy FOREIGN KEY (copy_id) REFERENCES public.copies(id) ON DELETE SET NULL;


--
-- Name: collection_events fk_collection_events_from_collection; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_events
    ADD CONSTRAINT fk_collection_events_from_collection FOREIGN KEY (from_collection_id) REFERENCES public.collections(id) ON DELETE SET NULL;


--
-- Name: collection_events fk_collection_events_to_collection; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_events
    ADD CONSTRAINT fk_collection_events_to_collection FOREIGN KEY (to_collection_id) REFERENCES public.collections(id) ON DELETE SET NULL;


--
-- Name: copies fk_copies_collection; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT fk_copies_collection FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;


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
-- Name: friend_group_collection_shares fk_friend_group_collection_shares_collection; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_collection_shares
    ADD CONSTRAINT fk_friend_group_collection_shares_collection FOREIGN KEY (collection_id, user_id) REFERENCES public.collections(id, user_id) ON DELETE CASCADE;


--
-- Name: friend_group_collection_shares fk_friend_group_collection_shares_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_collection_shares
    ADD CONSTRAINT fk_friend_group_collection_shares_membership FOREIGN KEY (user_id, group_id) REFERENCES public.friend_group_members(user_id, group_id) ON DELETE CASCADE;


--
-- Name: friend_group_list_shares fk_friend_group_list_shares_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_list_shares
    ADD CONSTRAINT fk_friend_group_list_shares_membership FOREIGN KEY (user_id, group_id) REFERENCES public.friend_group_members(user_id, group_id) ON DELETE CASCADE;


--
-- Name: list_entries fk_list_entries_copy; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_entries
    ADD CONSTRAINT fk_list_entries_copy FOREIGN KEY (copy_id) REFERENCES public.copies(id) ON DELETE CASCADE;


--
-- Name: list_entries fk_list_entries_list_kind; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_entries
    ADD CONSTRAINT fk_list_entries_list_kind FOREIGN KEY (list_id, kind) REFERENCES public.lists(id, kind) ON DELETE CASCADE;


--
-- Name: list_entries fk_list_entries_list_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_entries
    ADD CONSTRAINT fk_list_entries_list_user FOREIGN KEY (list_id, user_id) REFERENCES public.lists(id, user_id) ON DELETE CASCADE;


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
-- Name: printings fk_printings_size; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT fk_printings_size FOREIGN KEY (size) REFERENCES public.card_sizes(slug);


--
-- Name: friend_group_invites friend_group_invites_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_invites
    ADD CONSTRAINT friend_group_invites_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.friend_groups(id) ON DELETE CASCADE;


--
-- Name: friend_group_invites friend_group_invites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_invites
    ADD CONSTRAINT friend_group_invites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friend_group_list_shares friend_group_list_shares_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_list_shares
    ADD CONSTRAINT friend_group_list_shares_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lists(id) ON DELETE CASCADE;


--
-- Name: friend_group_member_contacts friend_group_member_contacts_member_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_member_contacts
    ADD CONSTRAINT friend_group_member_contacts_member_fkey FOREIGN KEY (group_id, user_id) REFERENCES public.friend_group_members(group_id, user_id) ON DELETE CASCADE;


--
-- Name: friend_group_member_contacts friend_group_member_contacts_method_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_member_contacts
    ADD CONSTRAINT friend_group_member_contacts_method_fkey FOREIGN KEY (contact_method_id) REFERENCES public.user_contact_methods(id) ON DELETE CASCADE;


--
-- Name: friend_group_members friend_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_members
    ADD CONSTRAINT friend_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.friend_groups(id) ON DELETE CASCADE;


--
-- Name: friend_group_members friend_group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_members
    ADD CONSTRAINT friend_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: keyword_translations keyword_translations_keyword_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_translations
    ADD CONSTRAINT keyword_translations_keyword_name_fkey FOREIGN KEY (keyword_name) REFERENCES public.keywords(name) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: keyword_translations keyword_translations_language_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_translations
    ADD CONSTRAINT keyword_translations_language_fkey FOREIGN KEY (language) REFERENCES public.languages(code) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: list_entries list_entries_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_entries
    ADD CONSTRAINT list_entries_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: list_entries list_entries_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_entries
    ADD CONSTRAINT list_entries_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: lists lists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: marketplace_groups marketplace_groups_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_groups
    ADD CONSTRAINT marketplace_groups_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id) ON DELETE SET NULL;


--
-- Name: marketplace_ignored_variants marketplace_ignored_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_ignored_variants
    ADD CONSTRAINT marketplace_ignored_variants_product_id_fkey FOREIGN KEY (marketplace_product_id) REFERENCES public.marketplace_products(id);


--
-- Name: marketplace_product_card_overrides marketplace_product_card_overrides_product_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_card_overrides
    ADD CONSTRAINT marketplace_product_card_overrides_product_fk FOREIGN KEY (marketplace_product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


--
-- Name: marketplace_product_prices marketplace_product_prices_marketplace_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_prices
    ADD CONSTRAINT marketplace_product_prices_marketplace_product_id_fkey FOREIGN KEY (marketplace_product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


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
-- Name: marketplace_products marketplace_sources_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_sources_group_fkey FOREIGN KEY (marketplace, group_id) REFERENCES public.marketplace_groups(marketplace, group_id);


--
-- Name: marketplace_product_card_overrides marketplace_staging_card_overrides_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_card_overrides
    ADD CONSTRAINT marketplace_staging_card_overrides_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: organization_members organization_members_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_org_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_owner_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pod_byes pod_byes_player_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_byes
    ADD CONSTRAINT pod_byes_player_fkey FOREIGN KEY (player_id) REFERENCES public.tournament_participants(id) ON DELETE CASCADE;


--
-- Name: pod_byes pod_byes_round_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_byes
    ADD CONSTRAINT pod_byes_round_fkey FOREIGN KEY (round_id) REFERENCES public.pod_rounds(id) ON DELETE CASCADE;


--
-- Name: pod_members pod_members_player_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_members
    ADD CONSTRAINT pod_members_player_fkey FOREIGN KEY (player_id) REFERENCES public.tournament_participants(id) ON DELETE CASCADE;


--
-- Name: pod_members pod_members_pod_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_members
    ADD CONSTRAINT pod_members_pod_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_rounds pod_rounds_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_rounds
    ADD CONSTRAINT pod_rounds_tournament_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: pods pods_round_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pods
    ADD CONSTRAINT pods_round_fkey FOREIGN KEY (round_id) REFERENCES public.pod_rounds(id) ON DELETE CASCADE;


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
-- Name: rules rules_kind_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_kind_version_fkey FOREIGN KEY (kind, version) REFERENCES public.rule_versions(kind, version) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tournament_participants tournament_participants_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_participants
    ADD CONSTRAINT tournament_participants_tournament_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_participants tournament_participants_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_participants
    ADD CONSTRAINT tournament_participants_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tournament_staff tournament_staff_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_staff
    ADD CONSTRAINT tournament_staff_tournament_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_staff tournament_staff_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_staff
    ADD CONSTRAINT tournament_staff_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tournaments tournaments_deck_format_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_deck_format_fkey FOREIGN KEY (deck_format) REFERENCES public.deck_formats(slug);


--
-- Name: tournaments tournaments_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_group_fkey FOREIGN KEY (group_id) REFERENCES public.friend_groups(id) ON DELETE SET NULL;


--
-- Name: tournaments tournaments_host_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_host_org_fkey FOREIGN KEY (host_org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: tournaments tournaments_host_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_host_user_fkey FOREIGN KEY (host_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_contact_methods user_contact_methods_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_contact_methods
    ADD CONSTRAINT user_contact_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


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
-- PostgreSQL database dump complete
--

\unrestrict UK6njl1ZxaCJwvXYrbDOgax0YyoHWhedY9dqGGkWf4Gj4w3Q7R4iyV7Op4N5Zwk

