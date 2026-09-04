--
-- PostgreSQL database dump
--

\restrict cDrQnrNSemgeCQQ7DcebmbobbWk6TH0Ds6ZLUOvCwegnjBFpQqHJYNkPPiOLpkl

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

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
-- Name: release_precision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.release_precision AS ENUM (
    'day',
    'month',
    'quarter',
    'year'
);


--
-- Name: set_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.set_type AS ENUM (
    'main',
    'supplemental'
);


--
-- Name: assert_organization_has_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_organization_has_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    target uuid;
  BEGIN
    IF TG_TABLE_NAME = 'organizations' THEN
      target := NEW.id;
    ELSE
      target := COALESCE(OLD.org_id, NEW.org_id);
    END IF;

    IF EXISTS (SELECT 1 FROM organizations o WHERE o.id = target)
       AND NOT EXISTS (
         SELECT 1 FROM organization_members m
         WHERE m.org_id = target AND m.role = 'owner'
       )
    THEN
      RAISE EXCEPTION 'organization % must keep at least one owner', target
        USING ERRCODE = '23514', CONSTRAINT = 'trg_organization_members_owner_guard';
    END IF;
    RETURN NULL;
  END;
  $$;


--
-- Name: candidate_cards_set_norm_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.candidate_cards_set_norm_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.norm_name := regexp_replace(lower(NEW.name), '[^[:alnum:]]', '', 'g');
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
      NEW.norm_name := regexp_replace(lower(NEW.norm_name), '[^[:alnum:]]', '', 'g');
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
      NEW.norm_name := regexp_replace(lower(NEW.name), '[^[:alnum:]]', '', 'g');
      RETURN NEW;
    END;
    $$;


--
-- Name: marketplace_product_compute_norm_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marketplace_product_compute_norm_name(product_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
      SELECT regexp_replace(lower(product_name), '[^[:alnum:]]', '', 'g')
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
-- Name: protect_well_known_language(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_well_known_language() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND OLD.is_well_known THEN
        RAISE EXCEPTION 'Cannot delete well-known language "%"', OLD.code;
      END IF;
      IF TG_OP = 'UPDATE' THEN
        IF OLD.is_well_known AND NEW.code != OLD.code THEN
          RAISE EXCEPTION 'Cannot rename well-known language "%"', OLD.code;
        END IF;
        IF OLD.is_well_known AND NOT NEW.is_well_known THEN
          RAISE EXCEPTION 'Cannot unmark well-known language "%"', OLD.code;
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
-- Name: rebalance_organization_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rebalance_organization_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    org RECORD;
    successor RECORD;
  BEGIN
    FOR org IN
      SELECT om.org_id AS id FROM organization_members om
      WHERE om.user_id = OLD.id AND om.role = 'owner'
        AND NOT EXISTS (
          SELECT 1 FROM organization_members co
          WHERE co.org_id = om.org_id AND co.user_id <> OLD.id AND co.role = 'owner'
        )
    LOOP
      SELECT user_id INTO successor
      FROM organization_members
      WHERE org_id = org.id AND user_id <> OLD.id
      ORDER BY (role = 'manager') DESC, joined_at ASC
      LIMIT 1;

      IF FOUND THEN
        UPDATE organization_members
           SET role = 'owner'
         WHERE org_id = org.id AND user_id = successor.user_id;
      ELSE
        -- The last member of an org is by invariant its last owner; the org
        -- goes with them, as the owner-pointer CASCADE used to arrange.
        DELETE FROM organizations WHERE id = org.id;
      END IF;
    END LOOP;
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
-- Name: snapshot_deleted_group_names(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_deleted_group_names() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      DELETE FROM card_trade_copies
       WHERE trade_id IN (
         SELECT id FROM card_trades
          WHERE group_id = OLD.id AND status IN ('pending', 'reserved')
       );

      UPDATE card_trades
         SET status = 'cancelled',
             closed_at = now(),
             expires_at = NULL,
             last_actor_user_id = NULL
       WHERE group_id = OLD.id
         AND status IN ('pending', 'reserved');

      UPDATE card_trades
         SET group_id = NULL, group_name = OLD.name
       WHERE group_id = OLD.id;

      RETURN OLD;
    END;
    $$;


--
-- Name: snapshot_deleted_user_names(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_deleted_user_names() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      display_name text := COALESCE(NULLIF(OLD.name, ''), 'Former member');
    BEGIN
      -- A live trade needs two people. Close the ones this account was in
      -- before snapshotting, so no request or reservation is left waiting on
      -- somebody who is gone, and release the copies a reservation had pinned.
      -- This is what leaving a group already does to that member's live trades.
      DELETE FROM card_trade_copies
       WHERE trade_id IN (
         SELECT id FROM card_trades
          WHERE (giver_user_id = OLD.id OR receiver_user_id = OLD.id)
            AND status IN ('pending', 'reserved')
       );

      UPDATE card_trades
         SET status = 'cancelled',
             closed_at = now(),
             expires_at = NULL,
             last_actor_user_id = NULL
       WHERE (giver_user_id = OLD.id OR receiver_user_id = OLD.id)
         AND status IN ('pending', 'reserved');

      UPDATE card_trades
         SET giver_user_id = NULL, giver_name = display_name
       WHERE giver_user_id = OLD.id;

      UPDATE card_trades
         SET receiver_user_id = NULL, receiver_name = display_name
       WHERE receiver_user_id = OLD.id;

      UPDATE loans
         SET borrower_user_id = NULL, borrower_name = display_name
       WHERE borrower_user_id = OLD.id;

      RETURN OLD;
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
-- Name: trg_card_card_types_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_card_card_types_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      affected_card_id uuid;
      primary_slug text;
    BEGIN
      affected_card_id := COALESCE(NEW.card_id, OLD.card_id);

      -- Card deleted in the same transaction (ON DELETE CASCADE) — nothing to check.
      IF NOT EXISTS (SELECT 1 FROM cards WHERE id = affected_card_id) THEN
        RETURN NULL;
      END IF;

      SELECT type_slug INTO primary_slug
      FROM card_card_types
      WHERE card_id = affected_card_id
      ORDER BY position
      LIMIT 1;

      IF primary_slug IS NULL THEN
        RAISE EXCEPTION 'card % must keep at least one card_card_types row (ADR-037)',
          affected_card_id;
      END IF;

      UPDATE cards SET type = primary_slug
      WHERE id = affected_card_id AND type IS DISTINCT FROM primary_slug;

      RETURN NULL;
    END;
    $$;


--
-- Name: trg_cards_seed_card_types(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cards_seed_card_types() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM card_card_types WHERE card_id = NEW.id) THEN
        INSERT INTO card_card_types (card_id, type_slug, position)
        VALUES (NEW.id, NEW.type, 0);
      END IF;
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    issuer text NOT NULL
);


--
-- Name: admin_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_events (
    id uuid DEFAULT uuidv7() NOT NULL,
    actor_user_id text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    entity_label text,
    card_slug text,
    old_values jsonb,
    new_values jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_admin_events_new_values_shape CHECK (((new_values IS NULL) OR (jsonb_typeof(new_values) = 'object'::text))),
    CONSTRAINT chk_admin_events_old_values_shape CHECK (((old_values IS NULL) OR (jsonb_typeof(old_values) = 'object'::text)))
);


--
-- Name: admin_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_grants (
    user_id text NOT NULL,
    section text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id text NOT NULL,
    config_id text DEFAULT 'default'::text NOT NULL,
    name text,
    start text,
    prefix text,
    key text NOT NULL,
    reference_id text NOT NULL,
    refill_interval integer,
    refill_amount integer,
    last_refill_at timestamp with time zone,
    enabled boolean DEFAULT true NOT NULL,
    rate_limit_enabled boolean DEFAULT true NOT NULL,
    rate_limit_time_window integer,
    rate_limit_max integer,
    request_count integer DEFAULT 0 NOT NULL,
    remaining integer,
    last_request timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    permissions text,
    metadata text
);


--
-- Name: art_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.art_variants (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_art_variants_label_not_empty CHECK ((label <> ''::text)),
    CONSTRAINT chk_art_variants_slug_not_empty CHECK ((slug <> ''::text))
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
    types text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT candidate_cards_submission_note_check CHECK ((submission_note <> ''::text)),
    CONSTRAINT chk_candidate_cards_energy_non_negative CHECK ((energy >= 0)),
    CONSTRAINT chk_candidate_cards_extra_data_shape CHECK (((extra_data IS NULL) OR (jsonb_typeof(extra_data) = 'object'::text))),
    CONSTRAINT chk_candidate_cards_might_bonus_non_negative CHECK ((might_bonus >= 0)),
    CONSTRAINT chk_candidate_cards_might_non_negative CHECK ((might >= 0)),
    CONSTRAINT chk_candidate_cards_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_candidate_cards_no_empty_effect_text CHECK ((effect_text <> ''::text)),
    CONSTRAINT chk_candidate_cards_no_empty_external_id CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_candidate_cards_no_empty_extra_data CHECK (((extra_data <> '{}'::jsonb) AND (extra_data <> 'null'::jsonb))),
    CONSTRAINT chk_candidate_cards_no_empty_rules_text CHECK ((rules_text <> ''::text)),
    CONSTRAINT chk_candidate_cards_no_empty_short_code CHECK ((short_code <> ''::text)),
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
    printed_effect_text text,
    flavor_text text,
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
    printed_year smallint,
    is_overnumbered boolean,
    CONSTRAINT candidate_printings_size_check CHECK ((size <> ''::text)),
    CONSTRAINT chk_candidate_printings_extra_data_shape CHECK (((extra_data IS NULL) OR (jsonb_typeof(extra_data) = 'object'::text))),
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
    CONSTRAINT chk_card_bans_dates_ordered CHECK (((unbanned_at IS NULL) OR (unbanned_at >= banned_at))),
    CONSTRAINT chk_card_bans_reason_not_empty CHECK ((reason <> ''::text))
);


--
-- Name: card_card_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_card_types (
    card_id uuid NOT NULL,
    type_slug text NOT NULL,
    "position" smallint NOT NULL,
    CONSTRAINT card_card_types_position_check CHECK (("position" >= 0))
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
    is_well_known boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_card_sizes_label_not_empty CHECK ((label <> ''::text)),
    CONSTRAINT chk_card_sizes_slug_not_empty CHECK ((slug <> ''::text))
);


--
-- Name: card_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_submissions (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    provider text NOT NULL,
    external_id text NOT NULL,
    candidate_card_id uuid,
    kind text NOT NULL,
    card_name text NOT NULL,
    card_slug text,
    note text,
    proposed_diff jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    resolution_reason text,
    resolution_note text,
    resolved_at timestamp with time zone,
    resolved_by_user_id text,
    accepted_card_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_card_submissions_card_name_not_empty CHECK ((card_name <> ''::text)),
    CONSTRAINT chk_card_submissions_card_slug_not_empty CHECK ((card_slug <> ''::text)),
    CONSTRAINT chk_card_submissions_external_id_not_empty CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_card_submissions_kind CHECK ((kind = ANY (ARRAY['new_card'::text, 'correction'::text, 'image'::text]))),
    CONSTRAINT chk_card_submissions_note_not_empty CHECK ((note <> ''::text)),
    CONSTRAINT chk_card_submissions_proposed_diff_shape CHECK (((proposed_diff IS NULL) OR (jsonb_typeof(proposed_diff) = 'array'::text))),
    CONSTRAINT chk_card_submissions_provider_not_empty CHECK ((provider <> ''::text)),
    CONSTRAINT chk_card_submissions_reason CHECK (((resolution_reason IS NULL) OR (resolution_reason = ANY (ARRAY['duplicate'::text, 'already_correct'::text, 'unverified'::text, 'not_a_card'::text, 'bad_image'::text])))),
    CONSTRAINT chk_card_submissions_resolution_note_not_empty CHECK ((resolution_note <> ''::text)),
    CONSTRAINT chk_card_submissions_resolved_at CHECK (((status = 'pending'::text) = (resolved_at IS NULL))),
    CONSTRAINT chk_card_submissions_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'already_correct'::text, 'not_applied'::text, 'rejected'::text])))
);


--
-- Name: card_super_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_super_types (
    card_id uuid NOT NULL,
    super_type_slug text NOT NULL
);


--
-- Name: card_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_tokens (
    card_id uuid NOT NULL,
    token_card_id uuid NOT NULL,
    source text DEFAULT 'derived'::text NOT NULL,
    CONSTRAINT chk_card_tokens_no_self CHECK ((card_id <> token_card_id)),
    CONSTRAINT chk_card_tokens_source CHECK ((source = ANY (ARRAY['derived'::text, 'manual'::text])))
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
    group_id uuid,
    giver_user_id text,
    receiver_user_id text,
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
    giver_name text,
    receiver_name text,
    group_name text,
    CONSTRAINT chk_card_trades_closed_shape CHECK (((status = ANY (ARRAY['declined'::text, 'cancelled'::text, 'expired'::text])) = (closed_at IS NOT NULL))),
    CONSTRAINT chk_card_trades_completed_shape CHECK (((status = 'completed'::text) = (completed_at IS NOT NULL))),
    CONSTRAINT chk_card_trades_distinct_parties CHECK ((giver_user_id <> receiver_user_id)),
    CONSTRAINT chk_card_trades_giver_name_not_empty CHECK (((giver_name IS NULL) OR (giver_name <> ''::text))),
    CONSTRAINT chk_card_trades_giver_party_shape CHECK ((num_nonnulls(giver_user_id, giver_name) = 1)),
    CONSTRAINT chk_card_trades_group_name_not_empty CHECK (((group_name IS NULL) OR (group_name <> ''::text))),
    CONSTRAINT chk_card_trades_group_shape CHECK ((num_nonnulls(group_id, group_name) = 1)),
    CONSTRAINT chk_card_trades_initiator CHECK ((initiator = ANY (ARRAY['giver'::text, 'receiver'::text]))),
    CONSTRAINT chk_card_trades_pending_expiry CHECK (((status <> 'pending'::text) OR (expires_at IS NOT NULL))),
    CONSTRAINT chk_card_trades_quantity CHECK ((quantity > 0)),
    CONSTRAINT chk_card_trades_receiver_name_not_empty CHECK (((receiver_name IS NULL) OR (receiver_name <> ''::text))),
    CONSTRAINT chk_card_trades_receiver_party_shape CHECK ((num_nonnulls(receiver_user_id, receiver_name) = 1)),
    CONSTRAINT chk_card_trades_reserved_accepted CHECK (((status <> 'reserved'::text) OR (accepted_at IS NOT NULL))),
    CONSTRAINT chk_card_trades_status CHECK ((status = ANY (ARRAY['pending'::text, 'reserved'::text, 'completed'::text, 'declined'::text, 'cancelled'::text, 'expired'::text])))
);


--
-- Name: card_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_types (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_card_types_label_not_empty CHECK ((label <> ''::text)),
    CONSTRAINT chk_card_types_slug_not_empty CHECK ((slug <> ''::text))
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
    max_copies_override smallint,
    CONSTRAINT cards_max_copies_override_check CHECK ((max_copies_override >= 0)),
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
-- Name: collection_sidebar_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_sidebar_prefs (
    user_id text NOT NULL,
    collection_id uuid NOT NULL,
    hidden boolean NOT NULL
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
-- Name: conditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conditions (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_conditions_label_not_empty CHECK ((label <> ''::text)),
    CONSTRAINT chk_conditions_slug_not_empty CHECK ((slug <> ''::text))
);


--
-- Name: copies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copies (
    id uuid DEFAULT uuidv7() NOT NULL,
    collection_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_id uuid NOT NULL,
    condition text,
    grader text,
    grade double precision,
    notes_public text,
    notes_private text,
    is_altered boolean DEFAULT false NOT NULL,
    links jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT chk_copies_condition_or_graded CHECK (((condition IS NULL) OR (grader IS NULL))),
    CONSTRAINT chk_copies_grade_half_steps CHECK (((grade IS NULL) OR ((grade >= (1)::double precision) AND (grade <= (10)::double precision) AND ((grade * (2)::double precision) = trunc((grade * (2)::double precision)))))),
    CONSTRAINT chk_copies_grader_with_grade CHECK (((grader IS NULL) = (grade IS NULL))),
    CONSTRAINT chk_copies_links_shape CHECK (((links IS NULL) OR (jsonb_typeof(links) = 'array'::text)))
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
    CONSTRAINT chk_deck_check_entries_approved_shape CHECK (((state <> 'approved'::text) OR ((approved_at IS NOT NULL) AND (approved_by IS NOT NULL)))),
    CONSTRAINT chk_deck_check_entries_change_summary_shape CHECK (((change_summary IS NULL) OR (jsonb_typeof(change_summary) = 'object'::text))),
    CONSTRAINT chk_deck_check_entries_checked_shape CHECK (((state <> 'checked'::text) OR ((checked_at IS NOT NULL) AND (checked_by IS NOT NULL)))),
    CONSTRAINT chk_deck_check_entries_notes CHECK (((notes IS NULL) OR (length(notes) <= 4000))),
    CONSTRAINT chk_deck_check_entries_player_message CHECK (((player_message IS NULL) OR (length(player_message) <= 2000))),
    CONSTRAINT chk_deck_check_entries_pre_edit_lines_shape CHECK (((pre_edit_lines IS NULL) OR (jsonb_typeof(pre_edit_lines) = 'array'::text))),
    CONSTRAINT chk_deck_check_entries_review_outcome CHECK (((review_outcome IS NULL) OR (review_outcome = ANY (ARRAY['ok'::text, 'issue'::text])))),
    CONSTRAINT chk_deck_check_entries_state CHECK ((state = ANY (ARRAY['editable'::text, 'submitted'::text, 'approved'::text, 'checked'::text, 'withdrawn'::text]))),
    CONSTRAINT chk_deck_check_entries_withdrawn_shape CHECK (((state = 'withdrawn'::text) = (withdrawn_at IS NOT NULL)))
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
-- Name: deck_folder_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_folder_entries (
    folder_id uuid NOT NULL,
    deck_id uuid NOT NULL,
    user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deck_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_folders (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_deck_folders_name_not_empty CHECK ((name <> ''::text))
);


--
-- Name: deck_formats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_formats (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_deck_formats_label_not_empty CHECK ((label <> ''::text)),
    CONSTRAINT chk_deck_formats_slug_not_empty CHECK ((slug <> ''::text))
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
    is_well_known boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_deck_zones_label_not_empty CHECK ((label <> ''::text)),
    CONSTRAINT chk_deck_zones_slug_not_empty CHECK ((slug <> ''::text))
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
    is_public boolean DEFAULT false NOT NULL,
    share_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    format_config jsonb,
    odds_config jsonb,
    cover_card_id uuid,
    cover_printing_id uuid,
    cover_position smallint,
    collection_id uuid,
    links jsonb DEFAULT '[]'::jsonb NOT NULL,
    family_id uuid,
    predecessor_deck_id uuid,
    is_primary boolean DEFAULT false NOT NULL,
    is_draft boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_decks_format_config_shape CHECK (((format_config IS NULL) OR (jsonb_typeof(format_config) = 'object'::text))),
    CONSTRAINT chk_decks_links_shape CHECK (((links IS NULL) OR (jsonb_typeof(links) = 'array'::text))),
    CONSTRAINT chk_decks_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_decks_odds_config_shape CHECK (((odds_config IS NULL) OR (jsonb_typeof(odds_config) = 'object'::text))),
    CONSTRAINT decks_cover_position_check CHECK (((cover_position >= 0) AND (cover_position <= 100)))
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
    CONSTRAINT chk_domains_color CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text)),
    CONSTRAINT chk_domains_label_not_empty CHECK ((label <> ''::text)),
    CONSTRAINT chk_domains_slug_not_empty CHECK ((slug <> ''::text))
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
    is_well_known boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_finishes_label_not_empty CHECK ((label <> ''::text)),
    CONSTRAINT chk_finishes_slug_not_empty CHECK ((slug <> ''::text))
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
-- Name: friend_group_discord_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_group_discord_links (
    id uuid DEFAULT uuidv7() NOT NULL,
    group_id uuid NOT NULL,
    guild_id text,
    guild_name text,
    code text,
    code_expires_at timestamp with time zone,
    created_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    linked_at timestamp with time zone,
    trade_channel_ids text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT chk_fg_discord_links_linked_at CHECK (((guild_id IS NULL) = (linked_at IS NULL))),
    CONSTRAINT chk_fg_discord_links_pending_expiry CHECK (((code IS NULL) OR (code_expires_at IS NOT NULL))),
    CONSTRAINT chk_fg_discord_links_state CHECK (((guild_id IS NULL) <> (code IS NULL))),
    CONSTRAINT chk_fg_discord_links_trade_channels CHECK (((guild_id IS NOT NULL) OR (cardinality(trade_channel_ids) = 0)))
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
    previous_slug text,
    CONSTRAINT chk_friend_groups_description CHECK (((description IS NULL) OR (length(description) <= 500))),
    CONSTRAINT chk_friend_groups_name CHECK (((length(name) >= 1) AND (length(name) <= 60))),
    CONSTRAINT chk_friend_groups_previous_slug CHECK (((previous_slug IS NULL) OR (previous_slug ~ '^[a-z0-9][a-z0-9-]{2,29}$'::text))),
    CONSTRAINT chk_friend_groups_slug CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{2,29}$'::text))
);


--
-- Name: graders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.graders (
    slug text NOT NULL,
    label text NOT NULL,
    sort_order smallint NOT NULL,
    is_well_known boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_graders_label_not_empty CHECK ((label <> ''::text)),
    CONSTRAINT chk_graders_slug_not_empty CHECK ((slug <> ''::text))
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
-- Name: ignored_meta_source_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ignored_meta_source_events (
    provider text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_ignored_meta_source_events_external_id CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_ignored_meta_source_events_provider CHECK ((provider <> ''::text))
);


--
-- Name: ignored_meta_source_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ignored_meta_source_players (
    provider text NOT NULL,
    event_external_id text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_ignored_meta_source_players_event_external_id CHECK ((event_external_id <> ''::text)),
    CONSTRAINT chk_ignored_meta_source_players_external_id CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_ignored_meta_source_players_provider CHECK ((provider <> ''::text))
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
    id uuid DEFAULT uuidv7() NOT NULL,
    kind text NOT NULL,
    trigger text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    duration_ms integer,
    error_message text,
    result jsonb,
    noop boolean,
    CONSTRAINT chk_job_runs_duration_nonnegative CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT chk_job_runs_finished_shape CHECK (((status = 'running'::text) = (finished_at IS NULL))),
    CONSTRAINT chk_job_runs_status CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text]))),
    CONSTRAINT chk_job_runs_trigger CHECK ((trigger = ANY (ARRAY['cron'::text, 'admin'::text, 'api'::text])))
);


--
-- Name: job_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_schedules (
    kind text NOT NULL,
    schedule text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_job_schedules_kind CHECK ((kind <> ''::text)),
    CONSTRAINT chk_job_schedules_schedule CHECK ((schedule <> ''::text))
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
    cost_keyword boolean DEFAULT false NOT NULL,
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
    color text,
    is_well_known boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_languages_color CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text)),
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
    CONSTRAINT chk_list_entries_copy_quantity CHECK (((kind <> 'copy'::text) OR (quantity = 1))),
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
    rule_combine text,
    sidebar_hidden boolean DEFAULT false NOT NULL,
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
    CONSTRAINT chk_lists_rules_shape CHECK (((rules IS NULL) OR (jsonb_typeof(rules) = 'array'::text))),
    CONSTRAINT lists_rule_combine_check CHECK ((rule_combine = ANY (ARRAY['sum'::text, 'max'::text, 'protect'::text, 'count-sum'::text, 'count-max'::text])))
);


--
-- Name: loan_copies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_copies (
    loan_id uuid NOT NULL,
    copy_id uuid NOT NULL
);


--
-- Name: loans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loans (
    id uuid DEFAULT uuidv7() NOT NULL,
    lender_user_id text NOT NULL,
    borrower_user_id text,
    borrower_name text,
    printing_id uuid NOT NULL,
    card_id uuid NOT NULL,
    quantity integer NOT NULL,
    returned_quantity integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    acknowledged_at timestamp with time zone,
    rejected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    CONSTRAINT chk_loans_ack_reject CHECK ((NOT ((acknowledged_at IS NOT NULL) AND (rejected_at IS NOT NULL)))),
    CONSTRAINT chk_loans_borrower_name_not_empty CHECK (((borrower_name IS NULL) OR (borrower_name <> ''::text))),
    CONSTRAINT chk_loans_borrower_shape CHECK ((num_nonnulls(borrower_user_id, borrower_name) = 1)),
    CONSTRAINT chk_loans_closed_shape CHECK (((status = 'active'::text) = (closed_at IS NULL))),
    CONSTRAINT chk_loans_distinct_parties CHECK (((borrower_user_id IS NULL) OR (borrower_user_id <> lender_user_id))),
    CONSTRAINT chk_loans_quantity CHECK ((quantity > 0)),
    CONSTRAINT chk_loans_returned_bounds CHECK (((returned_quantity >= 0) AND (returned_quantity <= quantity))),
    CONSTRAINT chk_loans_returned_complete CHECK (((status <> 'returned'::text) OR (returned_quantity = quantity))),
    CONSTRAINT chk_loans_status CHECK ((status = ANY (ARRAY['active'::text, 'returned'::text, 'written_off'::text])))
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
    set_id uuid,
    CONSTRAINT chk_marketplace_groups_marketplace CHECK ((marketplace = ANY (ARRAY['tcgplayer'::text, 'cardmarket'::text, 'cardtrader'::text])))
);


--
-- Name: marketplace_ignored_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_ignored_products (
    marketplace text NOT NULL,
    external_id integer NOT NULL,
    product_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_marketplace_ignored_products_marketplace CHECK ((marketplace = ANY (ARRAY['tcgplayer'::text, 'cardmarket'::text, 'cardtrader'::text])))
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
)
WITH (autovacuum_analyze_scale_factor='0.02', autovacuum_analyze_threshold='5000');


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
    CONSTRAINT chk_marketplace_products_marketplace CHECK ((marketplace = ANY (ARRAY['tcgplayer'::text, 'cardmarket'::text, 'cardtrader'::text]))),
    CONSTRAINT chk_marketplace_products_product_name_not_empty CHECK ((product_name <> ''::text))
);


--
-- Name: meta_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_credits (
    id uuid DEFAULT uuidv7() NOT NULL,
    meta_event_id uuid NOT NULL,
    user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    meta_event_player_id uuid
);


--
-- Name: meta_event_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_event_matches (
    id uuid DEFAULT uuidv7() NOT NULL,
    meta_event_id uuid NOT NULL,
    phase_order integer DEFAULT 0 NOT NULL,
    round_number integer NOT NULL,
    table_number integer,
    is_bye boolean DEFAULT false NOT NULL,
    is_draw boolean DEFAULT false NOT NULL,
    player1_id uuid NOT NULL,
    player2_id uuid,
    winner_id uuid,
    games_won_p1 smallint,
    games_won_p2 smallint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_match_id text,
    source_round_id text,
    CONSTRAINT chk_meta_event_matches_bye CHECK (((player2_id IS NULL) = is_bye)),
    CONSTRAINT chk_meta_event_matches_phase_order CHECK ((phase_order >= 0)),
    CONSTRAINT chk_meta_event_matches_round_number CHECK ((round_number >= 1)),
    CONSTRAINT chk_meta_event_matches_source_match_id CHECK (((source_match_id IS NULL) OR (source_match_id <> ''::text))),
    CONSTRAINT chk_meta_event_matches_source_round_id CHECK (((source_round_id IS NULL) OR (source_round_id <> ''::text))),
    CONSTRAINT chk_meta_event_matches_winner CHECK (((winner_id IS NULL) OR (winner_id = player1_id) OR (winner_id = player2_id)))
);


--
-- Name: meta_event_overlays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_event_overlays (
    id uuid DEFAULT uuidv7() NOT NULL,
    meta_event_id uuid,
    provider text,
    external_id text,
    name text,
    event_date date,
    format text,
    player_count integer,
    organizer text,
    notes text,
    tier text,
    country text,
    location text,
    claimed_fields text[] NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_by_user_id text NOT NULL,
    submission_note text,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_meta_event_overlays_accepted_at CHECK (((status = 'accepted'::text) = (accepted_at IS NOT NULL))),
    CONSTRAINT chk_meta_event_overlays_claimed_fields_known CHECK ((claimed_fields <@ ARRAY['name'::text, 'eventDate'::text, 'format'::text, 'playerCount'::text, 'organizer'::text, 'notes'::text, 'tier'::text, 'country'::text, 'location'::text])),
    CONSTRAINT chk_meta_event_overlays_country CHECK (((country IS NULL) OR (country ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT chk_meta_event_overlays_country_claimed CHECK (((country IS NULL) OR ('country'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_overlays_event_date_claimed CHECK (((event_date IS NULL) OR ('eventDate'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_overlays_external_id CHECK (((external_id IS NULL) OR (external_id <> ''::text))),
    CONSTRAINT chk_meta_event_overlays_format CHECK (((format IS NULL) OR (format <> ''::text))),
    CONSTRAINT chk_meta_event_overlays_format_claimed CHECK (((format IS NULL) OR ('format'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_overlays_key_shape CHECK (((provider IS NULL) = (external_id IS NULL))),
    CONSTRAINT chk_meta_event_overlays_location CHECK (((location IS NULL) OR ((length(location) >= 1) AND (length(location) <= 500)))),
    CONSTRAINT chk_meta_event_overlays_location_claimed CHECK (((location IS NULL) OR ('location'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_overlays_name CHECK (((name IS NULL) OR ((length(name) >= 1) AND (length(name) <= 120)))),
    CONSTRAINT chk_meta_event_overlays_name_claimed CHECK (((name IS NULL) OR ('name'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_overlays_notes CHECK (((notes IS NULL) OR (length(notes) <= 4000))),
    CONSTRAINT chk_meta_event_overlays_notes_claimed CHECK (((notes IS NULL) OR ('notes'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_overlays_organizer CHECK (((organizer IS NULL) OR ((length(organizer) >= 1) AND (length(organizer) <= 120)))),
    CONSTRAINT chk_meta_event_overlays_organizer_claimed CHECK (((organizer IS NULL) OR ('organizer'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_overlays_player_count CHECK (((player_count IS NULL) OR (player_count > 0))),
    CONSTRAINT chk_meta_event_overlays_player_count_claimed CHECK (((player_count IS NULL) OR ('playerCount'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_overlays_provider CHECK (((provider IS NULL) OR (provider <> ''::text))),
    CONSTRAINT chk_meta_event_overlays_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text]))),
    CONSTRAINT chk_meta_event_overlays_submission_note CHECK (((submission_note IS NULL) OR (submission_note <> ''::text))),
    CONSTRAINT chk_meta_event_overlays_tier CHECK (((tier IS NULL) OR (tier = ANY (ARRAY['premier'::text, 'competitive'::text, 'store'::text, 'casual'::text])))),
    CONSTRAINT chk_meta_event_overlays_tier_claimed CHECK (((tier IS NULL) OR ('tier'::text = ANY (claimed_fields))))
);


--
-- Name: meta_event_phases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_event_phases (
    id uuid DEFAULT uuidv7() NOT NULL,
    meta_event_id uuid NOT NULL,
    phase_order integer NOT NULL,
    name text,
    round_type text NOT NULL,
    round_count integer,
    rank_required integer,
    max_game_wins smallint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_meta_event_phases_max_game_wins CHECK (((max_game_wins IS NULL) OR (max_game_wins > 0))),
    CONSTRAINT chk_meta_event_phases_name CHECK (((name IS NULL) OR ((length(name) >= 1) AND (length(name) <= 120)))),
    CONSTRAINT chk_meta_event_phases_phase_order CHECK ((phase_order >= 0)),
    CONSTRAINT chk_meta_event_phases_rank_required CHECK (((rank_required IS NULL) OR (rank_required > 0))),
    CONSTRAINT chk_meta_event_phases_round_count CHECK (((round_count IS NULL) OR (round_count > 0))),
    CONSTRAINT chk_meta_event_phases_round_type CHECK ((round_type <> ''::text))
);


--
-- Name: meta_event_player_overlay_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_event_player_overlay_cards (
    overlay_id uuid NOT NULL,
    line_number integer NOT NULL,
    zone text NOT NULL,
    quantity integer NOT NULL,
    card_name text NOT NULL,
    card_id uuid,
    preferred_printing_id uuid,
    CONSTRAINT chk_meta_event_player_overlay_cards_card_name CHECK ((card_name <> ''::text)),
    CONSTRAINT chk_meta_event_player_overlay_cards_line CHECK ((line_number >= 0)),
    CONSTRAINT chk_meta_event_player_overlay_cards_quantity CHECK ((quantity > 0)),
    CONSTRAINT chk_meta_event_player_overlay_cards_zone CHECK ((zone <> ''::text))
);


--
-- Name: meta_event_player_overlays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_event_player_overlays (
    id uuid DEFAULT uuidv7() NOT NULL,
    meta_event_player_id uuid,
    meta_event_id uuid,
    event_overlay_id uuid,
    player_name text,
    rank integer,
    rank_is_tier boolean,
    wins smallint,
    losses smallint,
    draws smallint,
    match_points integer,
    opponent_match_win_pct double precision,
    game_win_pct double precision,
    opponent_game_win_pct double precision,
    entry_status text,
    legend_card_id uuid,
    champion_card_id uuid,
    list_status text,
    claimed_fields text[] NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_by_user_id text NOT NULL,
    submission_note text,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text,
    source_player_key text,
    CONSTRAINT chk_meta_event_player_overlays_accepted_at CHECK (((status = 'accepted'::text) = (accepted_at IS NOT NULL))),
    CONSTRAINT chk_meta_event_player_overlays_champion_card_id_claimed CHECK (((champion_card_id IS NULL) OR ('championCardId'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_claimed_fields_known CHECK ((claimed_fields <@ ARRAY['playerName'::text, 'rank'::text, 'rankIsTier'::text, 'wins'::text, 'losses'::text, 'draws'::text, 'matchPoints'::text, 'opponentMatchWinPct'::text, 'gameWinPct'::text, 'opponentGameWinPct'::text, 'entryStatus'::text, 'legendCardId'::text, 'championCardId'::text, 'listStatus'::text, 'cards'::text])),
    CONSTRAINT chk_meta_event_player_overlays_draws_claimed CHECK (((draws IS NULL) OR ('draws'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_entry_status CHECK (((entry_status IS NULL) OR (entry_status = ANY (ARRAY['complete'::text, 'eliminated'::text, 'dropped'::text])))),
    CONSTRAINT chk_meta_event_player_overlays_entry_status_claimed CHECK (((entry_status IS NULL) OR ('entryStatus'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_game_win_pct_claimed CHECK (((game_win_pct IS NULL) OR ('gameWinPct'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_legend_card_id_claimed CHECK (((legend_card_id IS NULL) OR ('legendCardId'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_list_status CHECK (((list_status IS NULL) OR (list_status = ANY (ARRAY['none'::text, 'partial'::text, 'full'::text])))),
    CONSTRAINT chk_meta_event_player_overlays_list_status_claimed CHECK (((list_status IS NULL) OR ('listStatus'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_losses_claimed CHECK (((losses IS NULL) OR ('losses'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_match_points CHECK (((match_points IS NULL) OR (match_points >= 0))),
    CONSTRAINT chk_meta_event_player_overlays_match_points_claimed CHECK (((match_points IS NULL) OR ('matchPoints'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_opponent_game_win_pct_claimed CHECK (((opponent_game_win_pct IS NULL) OR ('opponentGameWinPct'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_opponent_match_win_pct_claimed CHECK (((opponent_match_win_pct IS NULL) OR ('opponentMatchWinPct'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_player_name CHECK (((player_name IS NULL) OR ((length(player_name) >= 1) AND (length(player_name) <= 80)))),
    CONSTRAINT chk_meta_event_player_overlays_player_name_claimed CHECK (((player_name IS NULL) OR ('playerName'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_rank CHECK (((rank IS NULL) OR (rank >= 1))),
    CONSTRAINT chk_meta_event_player_overlays_rank_claimed CHECK (((rank IS NULL) OR ('rank'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_rank_is_tier_claimed CHECK (((rank_is_tier IS NULL) OR ('rankIsTier'::text = ANY (claimed_fields)))),
    CONSTRAINT chk_meta_event_player_overlays_source_key CHECK ((((provider IS NULL) = (source_player_key IS NULL)) AND ((provider IS NULL) OR ((provider <> ''::text) AND (source_player_key <> ''::text))))),
    CONSTRAINT chk_meta_event_player_overlays_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text]))),
    CONSTRAINT chk_meta_event_player_overlays_submission_note CHECK (((submission_note IS NULL) OR (submission_note <> ''::text))),
    CONSTRAINT chk_meta_event_player_overlays_target CHECK ((num_nonnulls(meta_event_player_id, meta_event_id, event_overlay_id) = 1)),
    CONSTRAINT chk_meta_event_player_overlays_tiebreakers CHECK ((((opponent_match_win_pct IS NULL) OR ((opponent_match_win_pct >= (0)::double precision) AND (opponent_match_win_pct <= (1)::double precision))) AND ((game_win_pct IS NULL) OR ((game_win_pct >= (0)::double precision) AND (game_win_pct <= (1)::double precision))) AND ((opponent_game_win_pct IS NULL) OR ((opponent_game_win_pct >= (0)::double precision) AND (opponent_game_win_pct <= (1)::double precision))))),
    CONSTRAINT chk_meta_event_player_overlays_wins_claimed CHECK (((wins IS NULL) OR ('wins'::text = ANY (claimed_fields))))
);


--
-- Name: meta_event_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_event_players (
    id uuid DEFAULT uuidv7() NOT NULL,
    meta_event_id uuid NOT NULL,
    rank integer NOT NULL,
    rank_is_tier boolean DEFAULT false NOT NULL,
    player_name text,
    wins smallint,
    losses smallint,
    draws smallint,
    legend_card_id uuid,
    champion_card_id uuid,
    deck_id uuid,
    list_status text DEFAULT 'none'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    uvsgames_player_id integer,
    match_points integer,
    opponent_match_win_pct double precision,
    game_win_pct double precision,
    opponent_game_win_pct double precision,
    entry_status text,
    source_identity text,
    minted_by_overlay_id uuid,
    CONSTRAINT chk_meta_event_players_deck_status CHECK (((deck_id IS NULL) = (list_status = 'none'::text))),
    CONSTRAINT chk_meta_event_players_entry_status CHECK (((entry_status IS NULL) OR (entry_status = ANY (ARRAY['complete'::text, 'eliminated'::text, 'dropped'::text])))),
    CONSTRAINT chk_meta_event_players_identity CHECK (((player_name IS NOT NULL) OR (uvsgames_player_id IS NOT NULL))),
    CONSTRAINT chk_meta_event_players_list_status CHECK ((list_status = ANY (ARRAY['none'::text, 'partial'::text, 'full'::text]))),
    CONSTRAINT chk_meta_event_players_match_points CHECK (((match_points IS NULL) OR (match_points >= 0))),
    CONSTRAINT chk_meta_event_players_player_name CHECK (((length(player_name) >= 1) AND (length(player_name) <= 80))),
    CONSTRAINT chk_meta_event_players_rank CHECK ((rank >= 1)),
    CONSTRAINT chk_meta_event_players_source_identity CHECK (((source_identity IS NULL) OR (source_identity <> ''::text))),
    CONSTRAINT chk_meta_event_players_tiebreakers CHECK ((((opponent_match_win_pct IS NULL) OR ((opponent_match_win_pct >= (0)::double precision) AND (opponent_match_win_pct <= (1)::double precision))) AND ((game_win_pct IS NULL) OR ((game_win_pct >= (0)::double precision) AND (game_win_pct <= (1)::double precision))) AND ((opponent_game_win_pct IS NULL) OR ((opponent_game_win_pct >= (0)::double precision) AND (opponent_game_win_pct <= (1)::double precision)))))
);


--
-- Name: meta_event_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_event_sources (
    id uuid DEFAULT uuidv7() NOT NULL,
    meta_event_id uuid NOT NULL,
    provider text,
    external_id text,
    label text NOT NULL,
    source_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    CONSTRAINT chk_meta_event_sources_external_id CHECK (((external_id IS NULL) OR (external_id <> ''::text))),
    CONSTRAINT chk_meta_event_sources_key_shape CHECK (((provider IS NULL) = (external_id IS NULL))),
    CONSTRAINT chk_meta_event_sources_label CHECK (((length(label) >= 1) AND (length(label) <= 60))),
    CONSTRAINT chk_meta_event_sources_provider CHECK (((provider IS NULL) OR (provider <> ''::text))),
    CONSTRAINT chk_meta_event_sources_source_url CHECK (((source_url IS NULL) OR ((length(source_url) >= 1) AND (length(source_url) <= 2000))))
);


--
-- Name: meta_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_events (
    id uuid DEFAULT uuidv7() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    event_date date NOT NULL,
    format text NOT NULL,
    player_count integer,
    organizer text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tier text DEFAULT 'store'::text NOT NULL,
    country text,
    location text,
    CONSTRAINT chk_meta_events_country CHECK (((country IS NULL) OR (country ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT chk_meta_events_location CHECK (((location IS NULL) OR ((length(location) >= 1) AND (length(location) <= 500)))),
    CONSTRAINT chk_meta_events_name CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT chk_meta_events_notes CHECK (((notes IS NULL) OR (length(notes) <= 4000))),
    CONSTRAINT chk_meta_events_organizer CHECK (((organizer IS NULL) OR ((length(organizer) >= 1) AND (length(organizer) <= 120)))),
    CONSTRAINT chk_meta_events_player_count CHECK (((player_count IS NULL) OR (player_count > 0))),
    CONSTRAINT chk_meta_events_slug CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'::text)),
    CONSTRAINT chk_meta_events_tier CHECK ((tier = ANY (ARRAY['premier'::text, 'competitive'::text, 'store'::text, 'casual'::text])))
);


--
-- Name: meta_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_submissions (
    id uuid DEFAULT uuidv7() CONSTRAINT meta_deck_submissions_id_not_null NOT NULL,
    user_id text CONSTRAINT meta_deck_submissions_user_id_not_null NOT NULL,
    provider text CONSTRAINT meta_deck_submissions_provider_not_null NOT NULL,
    external_id text CONSTRAINT meta_deck_submissions_external_id_not_null NOT NULL,
    meta_event_id uuid,
    event_name text CONSTRAINT meta_deck_submissions_event_name_not_null NOT NULL,
    player_name text,
    note text,
    status text DEFAULT 'pending'::text CONSTRAINT meta_deck_submissions_status_not_null NOT NULL,
    resolution_reason text,
    resolution_note text,
    resolved_at timestamp with time zone,
    resolved_by_user_id text,
    accepted_deck_id uuid,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT meta_deck_submissions_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT meta_deck_submissions_updated_at_not_null NOT NULL,
    kind text DEFAULT 'new_list'::text NOT NULL,
    field_edits jsonb,
    player_overlay_id uuid,
    CONSTRAINT chk_meta_submissions_event_name CHECK (((length(event_name) >= 1) AND (length(event_name) <= 120))),
    CONSTRAINT chk_meta_submissions_external_id CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_meta_submissions_field_edits CHECK (((field_edits IS NULL) OR (jsonb_typeof(field_edits) = 'object'::text))),
    CONSTRAINT chk_meta_submissions_field_edits_kind CHECK (((field_edits IS NULL) OR (kind = 'event_correction'::text))),
    CONSTRAINT chk_meta_submissions_kind CHECK ((kind = ANY (ARRAY['new_list'::text, 'completion'::text, 'correction'::text, 'event_correction'::text]))),
    CONSTRAINT chk_meta_submissions_note CHECK ((note <> ''::text)),
    CONSTRAINT chk_meta_submissions_player_name CHECK (((player_name IS NULL) OR ((length(player_name) >= 1) AND (length(player_name) <= 80)))),
    CONSTRAINT chk_meta_submissions_player_present CHECK (((player_name IS NULL) = (kind = 'event_correction'::text))),
    CONSTRAINT chk_meta_submissions_provider CHECK ((provider <> ''::text)),
    CONSTRAINT chk_meta_submissions_reason CHECK (((resolution_reason IS NULL) OR (resolution_reason = ANY (ARRAY['duplicate'::text, 'already_correct'::text, 'unverified'::text, 'incomplete_list'::text, 'not_an_event'::text])))),
    CONSTRAINT chk_meta_submissions_resolution_note CHECK ((resolution_note <> ''::text)),
    CONSTRAINT chk_meta_submissions_resolved_at CHECK (((status = 'pending'::text) = (resolved_at IS NULL))),
    CONSTRAINT chk_meta_submissions_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'already_correct'::text, 'not_applied'::text, 'rejected'::text])))
);


--
-- Name: meta_sync_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_sync_settings (
    id integer NOT NULL,
    auto_accept_min_players integer,
    auto_accept_notable boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_accept_official boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_meta_sync_settings_min_players CHECK (((auto_accept_min_players IS NULL) OR (auto_accept_min_players > 0))),
    CONSTRAINT chk_meta_sync_settings_singleton CHECK ((id = 1))
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
          WHERE (cst.card_id = c.id)), '{}'::text[]) AS super_types,
    COALESCE(( SELECT array_agg(cct.type_slug ORDER BY cct."position") AS array_agg
           FROM public.card_card_types cct
          WHERE (cct.card_id = c.id)), '{}'::text[]) AS types,
    COALESCE(( SELECT array_agg(ct.token_card_id ORDER BY tc.name) AS array_agg
           FROM (public.card_tokens ct
             JOIN public.cards tc ON ((tc.id = ct.token_card_id)))
          WHERE (ct.card_id = c.id)), '{}'::uuid[]) AS token_card_ids
   FROM public.cards c
  WITH NO DATA;


--
-- Name: mv_daily_printing_prices; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_daily_printing_prices AS
 WITH daily_sku AS (
         SELECT DISTINCT ON (pp.marketplace_product_id, ((date_trunc('day'::text, pp.recorded_at))::date)) pp.marketplace_product_id,
            mp.marketplace,
            (date_trunc('day'::text, pp.recorded_at))::date AS day,
            pp.zero_low_cents,
            pp.low_cents,
            pp.market_cents
           FROM (public.marketplace_product_prices pp
             JOIN public.marketplace_products mp ON ((mp.id = pp.marketplace_product_id)))
          ORDER BY pp.marketplace_product_id, ((date_trunc('day'::text, pp.recorded_at))::date), (pp.zero_low_cents IS NULL), pp.recorded_at DESC
        ), islands AS (
         SELECT s.marketplace_product_id,
            s.marketplace,
            s.day,
            s.zero_low_cents,
            s.low_cents,
            s.market_cents,
            count(s.zero_low_cents) OVER (PARTITION BY s.marketplace_product_id ORDER BY s.day ROWS UNBOUNDED PRECEDING) AS zero_island
           FROM daily_sku s
        ), carried AS (
         SELECT i.marketplace_product_id,
            i.marketplace,
            i.day,
            i.low_cents,
            i.market_cents,
            first_value(i.zero_low_cents) OVER (PARTITION BY i.marketplace_product_id, i.zero_island ORDER BY i.day) AS zero_carried
           FROM islands i
        )
 SELECT mpv.printing_id,
    d.marketplace,
    d.day,
    min(
        CASE
            WHEN (d.marketplace = 'cardtrader'::text) THEN COALESCE(d.zero_carried, d.low_cents)
            WHEN (d.marketplace = 'cardmarket'::text) THEN COALESCE(d.low_cents, d.market_cents)
            ELSE COALESCE(d.market_cents, d.low_cents)
        END) AS headline_cents
   FROM (carried d
     JOIN public.marketplace_product_variants mpv ON ((mpv.marketplace_product_id = d.marketplace_product_id)))
  WHERE (
        CASE
            WHEN (d.marketplace = 'cardtrader'::text) THEN COALESCE(d.zero_carried, d.low_cents)
            WHEN (d.marketplace = 'cardmarket'::text) THEN COALESCE(d.low_cents, d.market_cents)
            ELSE COALESCE(d.market_cents, d.low_cents)
        END IS NOT NULL)
  GROUP BY mpv.printing_id, d.marketplace, d.day
  WITH NO DATA;


--
-- Name: mv_latest_printing_prices; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_latest_printing_prices AS
 SELECT DISTINCT ON (printing_id, marketplace) printing_id,
    marketplace,
    headline_cents,
    day AS last_seen
   FROM public.mv_daily_printing_prices d
  ORDER BY printing_id, marketplace, day DESC
  WITH NO DATA;


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
    fallback_art_mode text DEFAULT 'auto'::text NOT NULL,
    fallback_image_file_id uuid,
    is_overnumbered boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_printings_artist_not_empty CHECK ((artist <> ''::text)),
    CONSTRAINT chk_printings_fallback_art_mode CHECK ((fallback_art_mode = ANY (ARRAY['auto'::text, 'pinned'::text, 'none'::text]))),
    CONSTRAINT chk_printings_fallback_pinned_has_image CHECK (((fallback_art_mode = 'pinned'::text) = (fallback_image_file_id IS NOT NULL))),
    CONSTRAINT chk_printings_no_empty_comment CHECK ((comment <> ''::text)),
    CONSTRAINT chk_printings_no_empty_flavor_text CHECK ((flavor_text <> ''::text)),
    CONSTRAINT chk_printings_no_empty_printed_effect_text CHECK ((printed_effect_text <> ''::text)),
    CONSTRAINT chk_printings_no_empty_printed_name CHECK ((printed_name <> ''::text)),
    CONSTRAINT chk_printings_no_empty_printed_rules_text CHECK ((printed_rules_text <> ''::text)),
    CONSTRAINT chk_printings_public_code_not_empty CHECK ((public_code <> ''::text)),
    CONSTRAINT chk_printings_short_code_not_empty CHECK ((short_code <> ''::text))
);


--
-- Name: mv_printing_foil_twins; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_printing_foil_twins AS
 SELECT id AS printing_id
   FROM public.printings p
  WHERE ((finish <> 'foil'::text) AND (EXISTS ( SELECT 1
           FROM public.printings q
          WHERE ((q.card_id = p.card_id) AND (q.short_code = p.short_code) AND (q.language = p.language) AND (q.size = p.size) AND (q.art_variant = p.art_variant) AND (q.is_signed = p.is_signed) AND (q.is_overnumbered = p.is_overnumbered) AND (q.marker_slugs = p.marker_slugs) AND (q.finish = 'foil'::text)))))
  WITH NO DATA;


--
-- Name: sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sets (
    name text NOT NULL,
    printed_total integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    slug text NOT NULL,
    id uuid DEFAULT uuidv7() NOT NULL,
    set_type public.set_type DEFAULT 'main'::public.set_type NOT NULL,
    CONSTRAINT chk_sets_name_not_empty CHECK ((name <> ''::text)),
    CONSTRAINT chk_sets_printed_total_non_negative CHECK ((printed_total >= 0)),
    CONSTRAINT chk_sets_slug_not_empty CHECK ((slug <> ''::text))
);


--
-- Name: mv_printings_canonical_rank; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_printings_canonical_rank AS
 SELECT p.id AS printing_id,
    (row_number() OVER (ORDER BY l.sort_order, s.sort_order, p.short_code, (array_length(p.marker_slugs, 1) IS NOT NULL), COALESCE(( SELECT min(m.sort_order) AS min
           FROM public.markers m
          WHERE (m.slug = ANY (p.marker_slugs))), 0), f.sort_order, cs.sort_order))::integer AS canonical_rank
   FROM ((((public.printings p
     JOIN public.sets s ON ((s.id = p.set_id)))
     JOIN public.finishes f ON ((f.slug = p.finish)))
     JOIN public.card_sizes cs ON ((cs.slug = p.size)))
     JOIN public.languages l ON ((l.code = p.language)))
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_organizations_description CHECK (((description IS NULL) OR (length(description) <= 4000))),
    CONSTRAINT chk_organizations_name CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT chk_organizations_slug CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'::text))
);


--
-- Name: overlay_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.overlay_channels (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_overlay_channels_payload_shape CHECK (((payload IS NULL) OR (jsonb_typeof(payload) = 'object'::text))),
    CONSTRAINT chk_overlay_channels_token_not_empty CHECK ((token <> ''::text))
);


--
-- Name: playloltcg_decklist_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playloltcg_decklist_cards (
    source_deck_id text NOT NULL,
    line_number integer NOT NULL,
    zone text NOT NULL,
    quantity integer NOT NULL,
    card_name text NOT NULL,
    CONSTRAINT chk_playloltcg_decklist_cards_card_name CHECK ((card_name <> ''::text)),
    CONSTRAINT chk_playloltcg_decklist_cards_line CHECK ((line_number >= 0)),
    CONSTRAINT chk_playloltcg_decklist_cards_quantity CHECK ((quantity > 0)),
    CONSTRAINT chk_playloltcg_decklist_cards_zone CHECK ((zone <> ''::text))
);


--
-- Name: playloltcg_decklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playloltcg_decklists (
    source_deck_id text NOT NULL,
    activity_shop_id bigint NOT NULL,
    fetch_status text NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_playloltcg_decklists_fetch_status CHECK ((fetch_status = ANY (ARRAY['fetched'::text, 'refused'::text]))),
    CONSTRAINT chk_playloltcg_decklists_source_deck_id CHECK ((source_deck_id <> ''::text))
);


--
-- Name: playloltcg_event_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playloltcg_event_checks (
    activity_shop_id integer NOT NULL,
    next_check_at timestamp with time zone,
    check_stage smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_playloltcg_event_checks_stage CHECK ((check_stage >= 0))
);


--
-- Name: playloltcg_event_standings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playloltcg_event_standings (
    activity_shop_id bigint NOT NULL,
    player_key text NOT NULL,
    source_user_id bigint,
    player_name text NOT NULL,
    rank integer,
    wins smallint,
    losses smallint,
    draws smallint,
    legend_name text,
    source_deck_id text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_playloltcg_event_standings_player_key CHECK ((player_key <> ''::text)),
    CONSTRAINT chk_playloltcg_event_standings_player_name CHECK (((length(player_name) >= 1) AND (length(player_name) <= 80))),
    CONSTRAINT chk_playloltcg_event_standings_rank CHECK (((rank IS NULL) OR (rank >= 1)))
);


--
-- Name: playloltcg_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playloltcg_events (
    activity_shop_id integer NOT NULL,
    shop_id integer,
    shop_name text,
    name text NOT NULL,
    activity_type text,
    activity_type_name text,
    battle_mode text,
    status smallint,
    start_at date,
    end_at date,
    player_count integer,
    max_user integer,
    fee integer,
    province text,
    city text,
    area text,
    address text,
    longitude double precision,
    latitude double precision,
    content_hash text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone NOT NULL,
    missing_since timestamp with time zone,
    CONSTRAINT chk_playloltcg_events_content_hash CHECK ((content_hash <> ''::text)),
    CONSTRAINT chk_playloltcg_events_name CHECK ((length(name) >= 1)),
    CONSTRAINT chk_playloltcg_events_player_count CHECK (((player_count IS NULL) OR (player_count >= 0))),
    CONSTRAINT chk_playloltcg_events_status CHECK (((status IS NULL) OR ((status >= 1) AND (status <= 5))))
);


--
-- Name: playloltcg_shops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playloltcg_shops (
    id integer NOT NULL,
    name text NOT NULL,
    province text,
    city text,
    area text,
    address text,
    longitude double precision,
    latitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_playloltcg_shops_name CHECK (((length(name) >= 1) AND (length(name) <= 200)))
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
    seat integer,
    CONSTRAINT chk_pod_members_game_points CHECK (((game_points IS NULL) OR (game_points >= 0))),
    CONSTRAINT chk_pod_members_placement CHECK (((placement IS NULL) OR ((placement >= 1) AND (placement <= 4)))),
    CONSTRAINT chk_pod_members_seat CHECK (((seat IS NULL) OR ((seat >= 0) AND (seat <= 3))))
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
    CONSTRAINT chk_pods_penalty_breakdown_shape CHECK (((penalty_breakdown IS NULL) OR (jsonb_typeof(penalty_breakdown) = 'object'::text))),
    CONSTRAINT chk_pods_result_status CHECK ((result_status = ANY (ARRAY['pending'::text, 'reported'::text]))),
    CONSTRAINT chk_pods_size CHECK ((size = ANY (ARRAY[2, 3, 4])))
);


--
-- Name: printing_citations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printing_citations (
    id uuid DEFAULT uuidv7() NOT NULL,
    printing_id uuid NOT NULL,
    label text NOT NULL,
    source_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_printing_citations_label CHECK (((length(label) >= 1) AND (length(label) <= 120))),
    CONSTRAINT chk_printing_citations_source_url CHECK (((source_url IS NULL) OR ((length(source_url) >= 1) AND (length(source_url) <= 2000))))
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
    id uuid DEFAULT uuidv7() NOT NULL,
    printing_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
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
    provider text NOT NULL,
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
    p.fallback_art_mode,
    p.fallback_image_file_id,
    p.is_overnumbered,
    COALESCE(r.canonical_rank, 2147483647) AS canonical_rank,
    (t.printing_id IS NOT NULL) AS has_foil_twin
   FROM ((public.printings p
     LEFT JOIN public.mv_printings_canonical_rank r ON ((r.printing_id = p.id)))
     LEFT JOIN public.mv_printing_foil_twins t ON ((t.printing_id = p.id)));


--
-- Name: product_printings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_printings (
    product_id uuid NOT NULL,
    printing_id uuid NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT chk_product_printings_quantity CHECK ((quantity > 0))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT uuidv7() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    set_id uuid,
    CONSTRAINT chk_products_description CHECK (((description IS NULL) OR (length(description) <= 2000))),
    CONSTRAINT chk_products_name CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT chk_products_slug CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'::text))
);


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
    helper_reviewable boolean DEFAULT false NOT NULL,
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
    id uuid DEFAULT uuidv7() NOT NULL,
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
-- Name: scan_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scan_index (
    id integer NOT NULL,
    format_version integer NOT NULL,
    bank_hash text NOT NULL,
    entry_count integer NOT NULL,
    encoder_tag text NOT NULL,
    watermark timestamp with time zone,
    built_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_ms integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_scan_index_singleton CHECK ((id = 1))
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
-- Name: set_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.set_releases (
    set_id uuid NOT NULL,
    language text NOT NULL,
    released_at date,
    "precision" public.release_precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_set_releases_period_start CHECK (((released_at IS NULL) OR ("precision" = 'day'::public.release_precision) OR (("precision" = 'month'::public.release_precision) AND (EXTRACT(day FROM released_at) = (1)::numeric)) OR (("precision" = 'quarter'::public.release_precision) AND (EXTRACT(day FROM released_at) = (1)::numeric) AND (EXTRACT(month FROM released_at) = ANY (ARRAY[(1)::numeric, (4)::numeric, (7)::numeric, (10)::numeric]))) OR (("precision" = 'year'::public.release_precision) AND (EXTRACT(doy FROM released_at) = (1)::numeric)))),
    CONSTRAINT chk_set_releases_precision CHECK (((released_at IS NULL) = ("precision" IS NULL)))
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
-- Name: stage_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stage_presets (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_stage_presets_config_object CHECK ((jsonb_typeof(config) = 'object'::text)),
    CONSTRAINT chk_stage_presets_name_not_empty CHECK ((name <> ''::text))
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
-- Name: tag_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tag_categories (
    id uuid DEFAULT uuidv7() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tag_categories_description_check CHECK ((description <> ''::text)),
    CONSTRAINT tag_categories_label_check CHECK ((label <> ''::text)),
    CONSTRAINT tag_categories_slug_check CHECK ((slug <> ''::text))
);


--
-- Name: tag_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tag_definitions (
    id uuid DEFAULT uuidv7() NOT NULL,
    tag text NOT NULL,
    category_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tag_definitions_tag_check CHECK (((tag <> ''::text) AND (tag = btrim(tag))))
);


--
-- Name: tier_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tier_lists (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    description text,
    tiers jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    share_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_tier_lists_tiers_array CHECK ((jsonb_typeof(tiers) = 'array'::text)),
    CONSTRAINT chk_tier_lists_title_not_empty CHECK ((title <> ''::text))
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
    region text,
    fixed_table integer,
    team_id uuid,
    CONSTRAINT chk_tournament_participants_claim_source CHECK (((claim_source IS NULL) OR (claim_source = ANY (ARRAY['judge_manual'::text, 'self_submit'::text, 'claim_link'::text])))),
    CONSTRAINT chk_tournament_participants_fixed_table CHECK (((fixed_table IS NULL) OR ((fixed_table >= 1) AND (fixed_table <= 999)))),
    CONSTRAINT chk_tournament_participants_name CHECK (((length(display_name) >= 1) AND (length(display_name) <= 120))),
    CONSTRAINT chk_tournament_participants_region CHECK (((region IS NULL) OR ((char_length(region) >= 1) AND (char_length(region) <= 50)))),
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
-- Name: tournament_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_teams (
    id uuid DEFAULT uuidv7() NOT NULL,
    tournament_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
    match_format text DEFAULT 'bo1'::text NOT NULL,
    win_points integer DEFAULT 3 NOT NULL,
    draw_points integer DEFAULT 1 NOT NULL,
    regions_enabled boolean DEFAULT false NOT NULL,
    play_mode text DEFAULT '1v1'::text NOT NULL,
    CONSTRAINT chk_tournaments_allowed_sets_shape CHECK (((allowed_sets IS NULL) OR (jsonb_typeof(allowed_sets) = 'array'::text))),
    CONSTRAINT chk_tournaments_bye_points CHECK ((bye_points >= 0)),
    CONSTRAINT chk_tournaments_deck_phase CHECK ((deck_phase = ANY (ARRAY['open'::text, 'closed'::text, 'locked'::text]))),
    CONSTRAINT chk_tournaments_deck_submission CHECK ((deck_submission = ANY (ARRAY['none'::text, 'optional'::text, 'required'::text]))),
    CONSTRAINT chk_tournaments_draw_points CHECK ((draw_points >= 0)),
    CONSTRAINT chk_tournaments_host CHECK ((((host_type = 'user'::text) AND (host_org_id IS NULL)) OR ((host_type = 'organization'::text) AND (host_user_id IS NULL)))),
    CONSTRAINT chk_tournaments_list_lock_mode CHECK ((list_lock_mode = ANY (ARRAY['on_submit'::text, 'at_deadline'::text]))),
    CONSTRAINT chk_tournaments_match_format CHECK ((match_format = ANY (ARRAY['bo1'::text, 'bo3'::text]))),
    CONSTRAINT chk_tournaments_name CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT chk_tournaments_pairing_style CHECK ((pairing_style = ANY (ARRAY['none'::text, 'pod'::text, 'swiss'::text]))),
    CONSTRAINT chk_tournaments_play_mode CHECK ((play_mode = ANY (ARRAY['1v1'::text, '2v2'::text]))),
    CONSTRAINT chk_tournaments_play_mode_pairing CHECK (((play_mode = '1v1'::text) OR (pairing_style <> 'pod'::text))),
    CONSTRAINT chk_tournaments_play_mode_regions CHECK (((play_mode = '1v1'::text) OR (regions_enabled = false))),
    CONSTRAINT chk_tournaments_scheme CHECK ((scoring_scheme = ANY (ARRAY['standard'::text, 'three_pod_reduced'::text]))),
    CONSTRAINT chk_tournaments_status CHECK ((status = ANY (ARRAY['setup'::text, 'running'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT chk_tournaments_win_points CHECK ((win_points >= 0))
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
    CONSTRAINT chk_user_preferences_data_shape CHECK (((data IS NULL) OR (jsonb_typeof(data) = 'object'::text))),
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
    riot_id text,
    meta_credit_visibility text DEFAULT 'hidden'::text NOT NULL,
    CONSTRAINT chk_users_meta_credit_visibility CHECK ((meta_credit_visibility = ANY (ARRAY['hidden'::text, 'name'::text, 'riot_id'::text])))
);


--
-- Name: uvsgames_decklist_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_decklist_cards (
    source_deck_id text NOT NULL,
    line_number integer NOT NULL,
    zone text NOT NULL,
    quantity integer NOT NULL,
    card_name text NOT NULL,
    CONSTRAINT chk_uvsgames_decklist_cards_card_name CHECK ((card_name <> ''::text)),
    CONSTRAINT chk_uvsgames_decklist_cards_line CHECK ((line_number >= 0)),
    CONSTRAINT chk_uvsgames_decklist_cards_quantity CHECK ((quantity > 0)),
    CONSTRAINT chk_uvsgames_decklist_cards_zone CHECK ((zone <> ''::text))
);


--
-- Name: uvsgames_decklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_decklists (
    source_deck_id text NOT NULL,
    external_id text NOT NULL,
    fetch_status text NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_uvsgames_decklists_fetch_status CHECK ((fetch_status = ANY (ARRAY['fetched'::text, 'refused'::text]))),
    CONSTRAINT chk_uvsgames_decklists_source_deck_id CHECK ((source_deck_id <> ''::text))
);


--
-- Name: uvsgames_event_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_event_checks (
    external_id text NOT NULL,
    next_check_at timestamp with time zone,
    check_stage smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_uvsgames_event_checks_stage CHECK ((check_stage >= 0))
);


--
-- Name: uvsgames_event_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_event_matches (
    external_id text NOT NULL,
    round_id text NOT NULL,
    phase_order integer DEFAULT 0 NOT NULL,
    round_number integer NOT NULL,
    table_number integer,
    is_bye boolean DEFAULT false NOT NULL,
    is_draw boolean DEFAULT false NOT NULL,
    player1_uvsgames_id integer NOT NULL,
    player2_uvsgames_id integer,
    winner_uvsgames_id integer,
    games_won_p1 smallint,
    games_won_p2 smallint,
    source_match_id text NOT NULL,
    CONSTRAINT chk_uvsgames_event_matches_bye CHECK (((player2_uvsgames_id IS NULL) = is_bye)),
    CONSTRAINT chk_uvsgames_event_matches_phase_order CHECK ((phase_order >= 0)),
    CONSTRAINT chk_uvsgames_event_matches_round_id CHECK ((round_id <> ''::text)),
    CONSTRAINT chk_uvsgames_event_matches_round_number CHECK ((round_number >= 1)),
    CONSTRAINT chk_uvsgames_event_matches_source_match_id CHECK ((source_match_id <> ''::text)),
    CONSTRAINT chk_uvsgames_event_matches_winner CHECK (((winner_uvsgames_id IS NULL) OR (winner_uvsgames_id = player1_uvsgames_id) OR (winner_uvsgames_id = player2_uvsgames_id)))
);


--
-- Name: uvsgames_event_phases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_event_phases (
    external_id text NOT NULL,
    phase_order integer NOT NULL,
    name text,
    round_type text NOT NULL,
    round_count integer,
    rank_required integer,
    max_game_wins smallint,
    CONSTRAINT chk_uvsgames_event_phases_max_game_wins CHECK (((max_game_wins IS NULL) OR (max_game_wins > 0))),
    CONSTRAINT chk_uvsgames_event_phases_order CHECK ((phase_order >= 0)),
    CONSTRAINT chk_uvsgames_event_phases_rank_required CHECK (((rank_required IS NULL) OR (rank_required > 0))),
    CONSTRAINT chk_uvsgames_event_phases_round_count CHECK (((round_count IS NULL) OR (round_count > 0))),
    CONSTRAINT chk_uvsgames_event_phases_round_type CHECK ((round_type <> ''::text))
);


--
-- Name: uvsgames_event_standings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_event_standings (
    external_id text NOT NULL,
    registration_id text NOT NULL,
    uvsgames_player_id integer,
    player_name text,
    rank integer,
    wins smallint,
    losses smallint,
    draws smallint,
    match_points integer,
    opponent_match_win_pct double precision,
    game_win_pct double precision,
    opponent_game_win_pct double precision,
    entry_status text,
    legend_name text,
    source_deck_id text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_uvsgames_event_standings_entry_status CHECK (((entry_status IS NULL) OR (entry_status = ANY (ARRAY['complete'::text, 'eliminated'::text, 'dropped'::text])))),
    CONSTRAINT chk_uvsgames_event_standings_identity CHECK (((uvsgames_player_id IS NOT NULL) OR (player_name IS NOT NULL))),
    CONSTRAINT chk_uvsgames_event_standings_match_points CHECK (((match_points IS NULL) OR (match_points >= 0))),
    CONSTRAINT chk_uvsgames_event_standings_rank CHECK (((rank IS NULL) OR (rank >= 1))),
    CONSTRAINT chk_uvsgames_event_standings_registration CHECK ((registration_id <> ''::text)),
    CONSTRAINT chk_uvsgames_event_standings_tiebreakers CHECK ((((opponent_match_win_pct IS NULL) OR ((opponent_match_win_pct >= (0)::double precision) AND (opponent_match_win_pct <= (1)::double precision))) AND ((game_win_pct IS NULL) OR ((game_win_pct >= (0)::double precision) AND (game_win_pct <= (1)::double precision))) AND ((opponent_game_win_pct IS NULL) OR ((opponent_game_win_pct >= (0)::double precision) AND (opponent_game_win_pct <= (1)::double precision)))))
);


--
-- Name: uvsgames_event_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_event_templates (
    template_id text NOT NULL,
    source_name text,
    watched boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tier text,
    CONSTRAINT chk_uvsgames_event_templates_source_name CHECK (((source_name IS NULL) OR ((length(source_name) >= 1) AND (length(source_name) <= 200)))),
    CONSTRAINT chk_uvsgames_event_templates_template_id CHECK ((template_id <> ''::text)),
    CONSTRAINT chk_uvsgames_event_templates_tier CHECK (((tier IS NULL) OR (tier = ANY (ARRAY['premier'::text, 'competitive'::text, 'store'::text, 'casual'::text]))))
);


--
-- Name: uvsgames_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_events (
    external_id text NOT NULL,
    name text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at_estimate timestamp with time zone,
    display_status text NOT NULL,
    decklist_status text,
    player_count integer,
    event_type text,
    event_format text,
    store_name text,
    location text,
    timezone text,
    content_hash text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone NOT NULL,
    missing_since timestamp with time zone,
    event_configuration_template text,
    store_id integer,
    results_fetched_at timestamp with time zone,
    CONSTRAINT chk_uvsgames_events_content_hash CHECK ((content_hash <> ''::text)),
    CONSTRAINT chk_uvsgames_events_display_status CHECK ((display_status <> ''::text)),
    CONSTRAINT chk_uvsgames_events_external_id CHECK ((external_id <> ''::text)),
    CONSTRAINT chk_uvsgames_events_name CHECK ((name <> ''::text)),
    CONSTRAINT chk_uvsgames_events_player_count CHECK (((player_count IS NULL) OR (player_count >= 0)))
);


--
-- Name: uvsgames_format_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_format_mappings (
    source_format text NOT NULL,
    mapped_format text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_uvsgames_format_mappings_source_format CHECK ((source_format <> ''::text))
);


--
-- Name: uvsgames_id_probes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_id_probes (
    external_id bigint NOT NULL,
    outcome text NOT NULL,
    game_type text,
    probed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_uvsgames_id_probes_external_id CHECK ((external_id > 0)),
    CONSTRAINT chk_uvsgames_id_probes_game_type CHECK (((game_type IS NULL) OR (game_type <> ''::text))),
    CONSTRAINT chk_uvsgames_id_probes_outcome CHECK ((outcome = ANY (ARRAY['other_game'::text, 'absent'::text, 'unreadable'::text])))
);


--
-- Name: uvsgames_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_players (
    id integer NOT NULL,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_uvsgames_players_display_name CHECK (((length(display_name) >= 1) AND (length(display_name) <= 80)))
);


--
-- Name: uvsgames_stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uvsgames_stores (
    id integer NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_uvsgames_stores_name CHECK (((length(name) >= 1) AND (length(name) <= 200)))
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
-- Name: admin_events admin_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_events
    ADD CONSTRAINT admin_events_pkey PRIMARY KEY (id);


--
-- Name: admin_grants admin_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_grants
    ADD CONSTRAINT admin_grants_pkey PRIMARY KEY (user_id, section);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (user_id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


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
-- Name: card_card_types card_card_types_card_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_card_types
    ADD CONSTRAINT card_card_types_card_id_position_key UNIQUE (card_id, "position");


--
-- Name: card_card_types card_card_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_card_types
    ADD CONSTRAINT card_card_types_pkey PRIMARY KEY (card_id, type_slug);


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
-- Name: card_submissions card_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_submissions
    ADD CONSTRAINT card_submissions_pkey PRIMARY KEY (id);


--
-- Name: card_super_types card_super_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_super_types
    ADD CONSTRAINT card_super_types_pkey PRIMARY KEY (card_id, super_type_slug);


--
-- Name: card_tokens card_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_tokens
    ADD CONSTRAINT card_tokens_pkey PRIMARY KEY (card_id, token_card_id);


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
-- Name: collection_sidebar_prefs collection_sidebar_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_sidebar_prefs
    ADD CONSTRAINT collection_sidebar_prefs_pkey PRIMARY KEY (user_id, collection_id);


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
-- Name: conditions conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conditions
    ADD CONSTRAINT conditions_pkey PRIMARY KEY (slug);


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
-- Name: deck_folder_entries deck_folder_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_folder_entries
    ADD CONSTRAINT deck_folder_entries_pkey PRIMARY KEY (folder_id, deck_id);


--
-- Name: deck_folders deck_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_folders
    ADD CONSTRAINT deck_folders_pkey PRIMARY KEY (id);


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
-- Name: friend_group_discord_links friend_group_discord_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_discord_links
    ADD CONSTRAINT friend_group_discord_links_pkey PRIMARY KEY (id);


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
-- Name: graders graders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graders
    ADD CONSTRAINT graders_pkey PRIMARY KEY (slug);


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
-- Name: ignored_meta_source_events ignored_meta_source_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ignored_meta_source_events
    ADD CONSTRAINT ignored_meta_source_events_pkey PRIMARY KEY (provider, external_id);


--
-- Name: ignored_meta_source_players ignored_meta_source_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ignored_meta_source_players
    ADD CONSTRAINT ignored_meta_source_players_pkey PRIMARY KEY (provider, event_external_id, external_id);


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
-- Name: job_schedules job_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_schedules
    ADD CONSTRAINT job_schedules_pkey PRIMARY KEY (kind);


--
-- Name: keyword_translations keyword_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_translations
    ADD CONSTRAINT keyword_translations_pkey PRIMARY KEY (keyword_name, language);


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
-- Name: loan_copies loan_copies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_copies
    ADD CONSTRAINT loan_copies_pkey PRIMARY KEY (loan_id, copy_id);


--
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


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
-- Name: meta_credits meta_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_credits
    ADD CONSTRAINT meta_credits_pkey PRIMARY KEY (id);


--
-- Name: meta_event_matches meta_event_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_matches
    ADD CONSTRAINT meta_event_matches_pkey PRIMARY KEY (id);


--
-- Name: meta_event_overlays meta_event_overlays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_overlays
    ADD CONSTRAINT meta_event_overlays_pkey PRIMARY KEY (id);


--
-- Name: meta_event_phases meta_event_phases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_phases
    ADD CONSTRAINT meta_event_phases_pkey PRIMARY KEY (id);


--
-- Name: meta_event_player_overlay_cards meta_event_player_overlay_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlay_cards
    ADD CONSTRAINT meta_event_player_overlay_cards_pkey PRIMARY KEY (overlay_id, line_number);


--
-- Name: meta_event_player_overlays meta_event_player_overlays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlays
    ADD CONSTRAINT meta_event_player_overlays_pkey PRIMARY KEY (id);


--
-- Name: meta_event_players meta_event_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_players
    ADD CONSTRAINT meta_event_players_pkey PRIMARY KEY (id);


--
-- Name: meta_event_sources meta_event_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_sources
    ADD CONSTRAINT meta_event_sources_pkey PRIMARY KEY (id);


--
-- Name: meta_events meta_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_events
    ADD CONSTRAINT meta_events_pkey PRIMARY KEY (id);


--
-- Name: meta_submissions meta_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_submissions
    ADD CONSTRAINT meta_submissions_pkey PRIMARY KEY (id);


--
-- Name: meta_sync_settings meta_sync_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_sync_settings
    ADD CONSTRAINT meta_sync_settings_pkey PRIMARY KEY (id);


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
-- Name: overlay_channels overlay_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overlay_channels
    ADD CONSTRAINT overlay_channels_pkey PRIMARY KEY (id);


--
-- Name: overlay_channels overlay_channels_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overlay_channels
    ADD CONSTRAINT overlay_channels_token_key UNIQUE (token);


--
-- Name: overlay_channels overlay_channels_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overlay_channels
    ADD CONSTRAINT overlay_channels_user_id_key UNIQUE (user_id);


--
-- Name: playloltcg_decklist_cards playloltcg_decklist_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_decklist_cards
    ADD CONSTRAINT playloltcg_decklist_cards_pkey PRIMARY KEY (source_deck_id, line_number);


--
-- Name: playloltcg_decklists playloltcg_decklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_decklists
    ADD CONSTRAINT playloltcg_decklists_pkey PRIMARY KEY (source_deck_id);


--
-- Name: playloltcg_event_checks playloltcg_event_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_event_checks
    ADD CONSTRAINT playloltcg_event_checks_pkey PRIMARY KEY (activity_shop_id);


--
-- Name: playloltcg_event_standings playloltcg_event_standings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_event_standings
    ADD CONSTRAINT playloltcg_event_standings_pkey PRIMARY KEY (activity_shop_id, player_key);


--
-- Name: playloltcg_events playloltcg_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_events
    ADD CONSTRAINT playloltcg_events_pkey PRIMARY KEY (activity_shop_id);


--
-- Name: playloltcg_shops playloltcg_shops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_shops
    ADD CONSTRAINT playloltcg_shops_pkey PRIMARY KEY (id);


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
-- Name: printing_citations printing_citations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_citations
    ADD CONSTRAINT printing_citations_pkey PRIMARY KEY (id);


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
    ADD CONSTRAINT printing_link_overrides_pkey PRIMARY KEY (external_id, finish, provider);


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
-- Name: product_printings product_printings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_printings
    ADD CONSTRAINT product_printings_pkey PRIMARY KEY (product_id, printing_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


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
-- Name: scan_index scan_index_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_index
    ADD CONSTRAINT scan_index_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: set_releases set_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_releases
    ADD CONSTRAINT set_releases_pkey PRIMARY KEY (set_id, language);


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
-- Name: stage_presets stage_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_presets
    ADD CONSTRAINT stage_presets_pkey PRIMARY KEY (id);


--
-- Name: super_types super_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_types
    ADD CONSTRAINT super_types_pkey PRIMARY KEY (slug);


--
-- Name: tag_categories tag_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_categories
    ADD CONSTRAINT tag_categories_pkey PRIMARY KEY (id);


--
-- Name: tag_categories tag_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_categories
    ADD CONSTRAINT tag_categories_slug_key UNIQUE (slug);


--
-- Name: tag_definitions tag_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_definitions
    ADD CONSTRAINT tag_definitions_pkey PRIMARY KEY (id);


--
-- Name: tag_definitions tag_definitions_tag_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_definitions
    ADD CONSTRAINT tag_definitions_tag_key UNIQUE (tag);


--
-- Name: tier_lists tier_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_lists
    ADD CONSTRAINT tier_lists_pkey PRIMARY KEY (id);


--
-- Name: tier_lists tier_lists_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_lists
    ADD CONSTRAINT tier_lists_share_token_key UNIQUE (share_token);


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
-- Name: tournament_teams tournament_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_pkey PRIMARY KEY (id);


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
-- Name: deck_folders uq_deck_folders_id_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_folders
    ADD CONSTRAINT uq_deck_folders_id_user UNIQUE (id, user_id);


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
-- Name: loan_copies uq_loan_copies_copy; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_copies
    ADD CONSTRAINT uq_loan_copies_copy UNIQUE (copy_id);


--
-- Name: meta_event_phases uq_meta_event_phases_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_phases
    ADD CONSTRAINT uq_meta_event_phases_order UNIQUE (meta_event_id, phase_order);


--
-- Name: meta_event_players uq_meta_event_players_deck; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_players
    ADD CONSTRAINT uq_meta_event_players_deck UNIQUE (deck_id);


--
-- Name: meta_events uq_meta_events_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_events
    ADD CONSTRAINT uq_meta_events_slug UNIQUE (slug);


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
-- Name: printings uq_printings_id_card; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT uq_printings_id_card UNIQUE (id, card_id);


--
-- Name: printings uq_printings_identity; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT uq_printings_identity UNIQUE NULLS NOT DISTINCT (card_id, short_code, finish, marker_slugs, language, size) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: printings uq_printings_variant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT uq_printings_variant UNIQUE (short_code, art_variant, is_signed, is_overnumbered, marker_slugs, rarity, finish, language, size) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: tournament_teams uq_tournament_teams_id_tournament; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT uq_tournament_teams_id_tournament UNIQUE (id, tournament_id);


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
-- Name: uvsgames_decklist_cards uvsgames_decklist_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_decklist_cards
    ADD CONSTRAINT uvsgames_decklist_cards_pkey PRIMARY KEY (source_deck_id, line_number);


--
-- Name: uvsgames_decklists uvsgames_decklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_decklists
    ADD CONSTRAINT uvsgames_decklists_pkey PRIMARY KEY (source_deck_id);


--
-- Name: uvsgames_event_checks uvsgames_event_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_checks
    ADD CONSTRAINT uvsgames_event_checks_pkey PRIMARY KEY (external_id);


--
-- Name: uvsgames_event_matches uvsgames_event_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_matches
    ADD CONSTRAINT uvsgames_event_matches_pkey PRIMARY KEY (external_id, round_id, player1_uvsgames_id);


--
-- Name: uvsgames_event_phases uvsgames_event_phases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_phases
    ADD CONSTRAINT uvsgames_event_phases_pkey PRIMARY KEY (external_id, phase_order);


--
-- Name: uvsgames_event_standings uvsgames_event_standings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_standings
    ADD CONSTRAINT uvsgames_event_standings_pkey PRIMARY KEY (external_id, registration_id);


--
-- Name: uvsgames_event_templates uvsgames_event_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_templates
    ADD CONSTRAINT uvsgames_event_templates_pkey PRIMARY KEY (template_id);


--
-- Name: uvsgames_events uvsgames_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_events
    ADD CONSTRAINT uvsgames_events_pkey PRIMARY KEY (external_id);


--
-- Name: uvsgames_format_mappings uvsgames_format_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_format_mappings
    ADD CONSTRAINT uvsgames_format_mappings_pkey PRIMARY KEY (source_format);


--
-- Name: uvsgames_id_probes uvsgames_id_probes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_id_probes
    ADD CONSTRAINT uvsgames_id_probes_pkey PRIMARY KEY (external_id);


--
-- Name: uvsgames_players uvsgames_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_players
    ADD CONSTRAINT uvsgames_players_pkey PRIMARY KEY (id);


--
-- Name: uvsgames_stores uvsgames_stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_stores
    ADD CONSTRAINT uvsgames_stores_pkey PRIMARY KEY (id);


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
-- Name: idx_admin_events_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_actor ON public.admin_events USING btree (actor_user_id, created_at DESC, id DESC);


--
-- Name: idx_admin_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_events_created ON public.admin_events USING btree (created_at DESC, id DESC);


--
-- Name: idx_api_keys_config_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_config_id ON public.api_keys USING btree (config_id);


--
-- Name: idx_api_keys_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_key ON public.api_keys USING btree (key);


--
-- Name: idx_api_keys_reference_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_reference_id ON public.api_keys USING btree (reference_id);


--
-- Name: idx_candidate_cards_norm_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candidate_cards_norm_name ON public.candidate_cards USING btree (norm_name);


--
-- Name: idx_candidate_cards_provider_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_candidate_cards_provider_external_id ON public.candidate_cards USING btree (provider, external_id);


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
-- Name: idx_candidate_printings_card_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_candidate_printings_card_external_id ON public.candidate_printings USING btree (candidate_card_id, external_id);


--
-- Name: idx_card_card_types_type_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_card_types_type_slug ON public.card_card_types USING btree (type_slug);


--
-- Name: idx_card_custom_tags_custom_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_custom_tags_custom_tag_id ON public.card_custom_tags USING btree (custom_tag_id);


--
-- Name: idx_card_domains_domain_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_domains_domain_slug ON public.card_domains USING btree (domain_slug);


--
-- Name: idx_card_submissions_candidate_card_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_submissions_candidate_card_id ON public.card_submissions USING btree (candidate_card_id) WHERE (candidate_card_id IS NOT NULL);


--
-- Name: idx_card_submissions_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_submissions_user_created ON public.card_submissions USING btree (user_id, created_at DESC, id DESC);


--
-- Name: idx_card_submissions_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_submissions_user_status ON public.card_submissions USING btree (user_id, status);


--
-- Name: idx_card_tokens_token_card_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_tokens_token_card_id ON public.card_tokens USING btree (token_card_id);


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
-- Name: idx_collection_events_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_events_printing ON public.collection_events USING btree (printing_id);


--
-- Name: idx_collection_events_to_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_events_to_collection ON public.collection_events USING btree (to_collection_id) WHERE (to_collection_id IS NOT NULL);


--
-- Name: idx_collection_events_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_events_user_created ON public.collection_events USING btree (user_id, created_at, id);


--
-- Name: idx_collection_sidebar_prefs_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_sidebar_prefs_collection ON public.collection_sidebar_prefs USING btree (collection_id);


--
-- Name: idx_collections_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collections_group ON public.collections USING btree (group_id);


--
-- Name: idx_collections_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collections_user_id ON public.collections USING btree (user_id);


--
-- Name: idx_copies_collection_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_collection_created ON public.copies USING btree (collection_id, created_at DESC, id);


--
-- Name: idx_copies_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copies_printing ON public.copies USING btree (printing_id);


--
-- Name: idx_custom_tags_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_tags_category_id ON public.custom_tags USING btree (category_id);


--
-- Name: idx_deck_cards_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_cards_card ON public.deck_cards USING btree (card_id);


--
-- Name: idx_deck_cards_preferred_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_cards_preferred_printing ON public.deck_cards USING btree (preferred_printing_id) WHERE (preferred_printing_id IS NOT NULL);


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
-- Name: idx_deck_folder_entries_deck; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_folder_entries_deck ON public.deck_folder_entries USING btree (deck_id);


--
-- Name: idx_deck_matchup_plans_deck; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deck_matchup_plans_deck ON public.deck_matchup_plans USING btree (deck_id);


--
-- Name: idx_decks_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decks_collection ON public.decks USING btree (collection_id) WHERE (collection_id IS NOT NULL);


--
-- Name: idx_decks_family_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decks_family_id ON public.decks USING btree (family_id) WHERE (family_id IS NOT NULL);


--
-- Name: idx_decks_predecessor_deck_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decks_predecessor_deck_id ON public.decks USING btree (predecessor_deck_id) WHERE (predecessor_deck_id IS NOT NULL);


--
-- Name: idx_decks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decks_user_id ON public.decks USING btree (user_id);


--
-- Name: idx_distribution_channels_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distribution_channels_parent_id ON public.distribution_channels USING btree (parent_id);


--
-- Name: idx_fg_discord_links_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fg_discord_links_group ON public.friend_group_discord_links USING btree (group_id);


--
-- Name: idx_friend_group_collection_shares_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_group_collection_shares_collection ON public.friend_group_collection_shares USING btree (collection_id);


--
-- Name: idx_friend_group_invites_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_group_invites_user ON public.friend_group_invites USING btree (user_id);


--
-- Name: idx_friend_group_list_shares_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_group_list_shares_list ON public.friend_group_list_shares USING btree (list_id);


--
-- Name: idx_friend_groups_previous_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_groups_previous_slug ON public.friend_groups USING btree (previous_slug) WHERE (previous_slug IS NOT NULL);


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

CREATE UNIQUE INDEX idx_job_runs_running ON public.job_runs USING btree (kind) WHERE (status = 'running'::text);


--
-- Name: idx_list_entries_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_list_entries_card ON public.list_entries USING btree (card_id) WHERE (card_id IS NOT NULL);


--
-- Name: idx_list_entries_copy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_list_entries_copy ON public.list_entries USING btree (copy_id) WHERE (copy_id IS NOT NULL);


--
-- Name: idx_list_entries_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_list_entries_list ON public.list_entries USING btree (list_id);


--
-- Name: idx_list_entries_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_list_entries_printing ON public.list_entries USING btree (printing_id) WHERE (printing_id IS NOT NULL);


--
-- Name: idx_lists_user_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lists_user_intent ON public.lists USING btree (user_id, intent);


--
-- Name: idx_loans_borrower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loans_borrower ON public.loans USING btree (borrower_user_id, status);


--
-- Name: idx_loans_lender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loans_lender ON public.loans USING btree (lender_user_id, status);


--
-- Name: idx_marketplace_product_variants_printing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_product_variants_printing_id ON public.marketplace_product_variants USING btree (printing_id);


--
-- Name: idx_marketplace_products_norm_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_products_norm_name_trgm ON public.marketplace_products USING gin (norm_name public.gin_trgm_ops);


--
-- Name: idx_meta_credits_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_credits_event ON public.meta_credits USING btree (meta_event_id);


--
-- Name: idx_meta_credits_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_credits_user ON public.meta_credits USING btree (user_id);


--
-- Name: idx_meta_event_matches_round; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_matches_round ON public.meta_event_matches USING btree (meta_event_id, phase_order, round_number);


--
-- Name: idx_meta_event_overlays_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_overlays_event ON public.meta_event_overlays USING btree (meta_event_id);


--
-- Name: idx_meta_event_overlays_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_overlays_pending ON public.meta_event_overlays USING btree (created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_meta_event_player_overlay_cards_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_player_overlay_cards_unresolved ON public.meta_event_player_overlay_cards USING btree (overlay_id) WHERE (card_id IS NULL);


--
-- Name: idx_meta_event_player_overlays_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_player_overlays_event ON public.meta_event_player_overlays USING btree (meta_event_id);


--
-- Name: idx_meta_event_player_overlays_event_overlay; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_player_overlays_event_overlay ON public.meta_event_player_overlays USING btree (event_overlay_id);


--
-- Name: idx_meta_event_player_overlays_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_player_overlays_pending ON public.meta_event_player_overlays USING btree (created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_meta_event_player_overlays_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_player_overlays_player ON public.meta_event_player_overlays USING btree (meta_event_player_id);


--
-- Name: idx_meta_event_players_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_players_event ON public.meta_event_players USING btree (meta_event_id, rank);


--
-- Name: idx_meta_event_players_legend; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_players_legend ON public.meta_event_players USING btree (legend_card_id);


--
-- Name: idx_meta_event_players_minted_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_players_minted_by ON public.meta_event_players USING btree (minted_by_overlay_id) WHERE (minted_by_overlay_id IS NOT NULL);


--
-- Name: idx_meta_event_players_player_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_players_player_key ON public.meta_event_players USING btree (regexp_replace(source_identity, '#\d+$'::text, ''::text)) WHERE (source_identity IS NOT NULL);


--
-- Name: idx_meta_event_sources_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_event_sources_event ON public.meta_event_sources USING btree (meta_event_id);


--
-- Name: idx_meta_events_event_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_events_event_date ON public.meta_events USING btree (event_date DESC);


--
-- Name: idx_meta_events_format; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_events_format ON public.meta_events USING btree (format);


--
-- Name: idx_meta_submissions_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_submissions_user_created ON public.meta_submissions USING btree (user_id, created_at DESC, id DESC);


--
-- Name: idx_meta_submissions_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_submissions_user_status ON public.meta_submissions USING btree (user_id, status);


--
-- Name: idx_mv_card_aggregates_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_card_aggregates_pk ON public.mv_card_aggregates USING btree (card_id);


--
-- Name: idx_mv_daily_printing_prices_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_daily_printing_prices_latest ON public.mv_daily_printing_prices USING btree (marketplace, printing_id, day DESC);


--
-- Name: idx_mv_daily_printing_prices_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_daily_printing_prices_pk ON public.mv_daily_printing_prices USING btree (printing_id, marketplace, day);


--
-- Name: idx_mv_latest_printing_prices_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_latest_printing_prices_pk ON public.mv_latest_printing_prices USING btree (printing_id, marketplace);


--
-- Name: idx_mv_printing_foil_twins_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_printing_foil_twins_pk ON public.mv_printing_foil_twins USING btree (printing_id);


--
-- Name: idx_mv_printings_canonical_rank_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_printings_canonical_rank_pk ON public.mv_printings_canonical_rank USING btree (printing_id);


--
-- Name: idx_organization_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_user ON public.organization_members USING btree (user_id);


--
-- Name: idx_playloltcg_decklists_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playloltcg_decklists_event ON public.playloltcg_decklists USING btree (activity_shop_id);


--
-- Name: idx_playloltcg_event_checks_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playloltcg_event_checks_due ON public.playloltcg_event_checks USING btree (next_check_at) WHERE (next_check_at IS NOT NULL);


--
-- Name: idx_playloltcg_events_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playloltcg_events_page ON public.playloltcg_events USING btree (start_at DESC NULLS LAST, activity_shop_id DESC);


--
-- Name: idx_playloltcg_events_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playloltcg_events_shop ON public.playloltcg_events USING btree (shop_id) WHERE (shop_id IS NOT NULL);


--
-- Name: idx_playloltcg_events_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playloltcg_events_start ON public.playloltcg_events USING btree (start_at);


--
-- Name: idx_pod_byes_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_byes_player ON public.pod_byes USING btree (player_id);


--
-- Name: idx_pod_members_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_members_player ON public.pod_members USING btree (player_id);


--
-- Name: idx_printing_citations_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_citations_printing ON public.printing_citations USING btree (printing_id, sort_order, id);


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
-- Name: idx_printing_images_image_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_images_image_file ON public.printing_images USING btree (image_file_id);


--
-- Name: idx_printing_images_printing_face; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printing_images_printing_face ON public.printing_images USING btree (printing_id, face);


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
-- Name: idx_printings_fallback_image_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printings_fallback_image_file ON public.printings USING btree (fallback_image_file_id) WHERE (fallback_image_file_id IS NOT NULL);


--
-- Name: idx_printings_marker_slugs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printings_marker_slugs ON public.printings USING gin (marker_slugs);


--
-- Name: idx_printings_set_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printings_set_id ON public.printings USING btree (set_id);


--
-- Name: idx_product_printings_printing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_printings_printing ON public.product_printings USING btree (printing_id);


--
-- Name: idx_products_set; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_set ON public.products USING btree (set_id);


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
-- Name: idx_tag_definitions_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tag_definitions_category_id ON public.tag_definitions USING btree (category_id);


--
-- Name: idx_tier_lists_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tier_lists_user_id ON public.tier_lists USING btree (user_id);


--
-- Name: idx_tournament_participants_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_participants_team ON public.tournament_participants USING btree (team_id);


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
-- Name: idx_tournament_teams_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_teams_tournament ON public.tournament_teams USING btree (tournament_id);


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
-- Name: idx_uvsgames_decklists_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvsgames_decklists_event ON public.uvsgames_decklists USING btree (external_id);


--
-- Name: idx_uvsgames_event_checks_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvsgames_event_checks_due ON public.uvsgames_event_checks USING btree (next_check_at) WHERE (next_check_at IS NOT NULL);


--
-- Name: idx_uvsgames_event_matches_round; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvsgames_event_matches_round ON public.uvsgames_event_matches USING btree (external_id, phase_order, round_number);


--
-- Name: idx_uvsgames_event_standings_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvsgames_event_standings_player ON public.uvsgames_event_standings USING btree (uvsgames_player_id);


--
-- Name: idx_uvsgames_events_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvsgames_events_page ON public.uvsgames_events USING btree (start_at DESC NULLS LAST, external_id DESC);


--
-- Name: idx_uvsgames_events_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvsgames_events_start ON public.uvsgames_events USING btree (start_at DESC);


--
-- Name: idx_uvsgames_events_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvsgames_events_store ON public.uvsgames_events USING btree (store_id) WHERE (store_id IS NOT NULL);


--
-- Name: idx_uvsgames_events_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uvsgames_events_template ON public.uvsgames_events USING btree (event_configuration_template) WHERE (event_configuration_template IS NOT NULL);


--
-- Name: marketplace_product_variants_product_printing_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_product_variants_product_printing_key ON public.marketplace_product_variants USING btree (marketplace_product_id, printing_id);


--
-- Name: marketplace_products_sku_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_products_sku_key ON public.marketplace_products USING btree (marketplace, external_id, finish, language) NULLS NOT DISTINCT;


--
-- Name: uq_accounts_issuer_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_accounts_issuer_account ON public.accounts USING btree (issuer, account_id);


--
-- Name: uq_accounts_provider_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_accounts_provider_account ON public.accounts USING btree (provider_id, account_id);


--
-- Name: uq_card_bans_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_card_bans_active ON public.card_bans USING btree (card_id, format_id) WHERE (unbanned_at IS NULL);


--
-- Name: uq_card_submissions_provider_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_card_submissions_provider_external ON public.card_submissions USING btree (provider, external_id);


--
-- Name: uq_card_trades_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_card_trades_live ON public.card_trades USING btree (group_id, giver_user_id, receiver_user_id, printing_id) WHERE ((status = 'pending'::text) OR ((status = 'reserved'::text) AND (giver_sync_applied_at IS NULL) AND (receiver_sync_applied_at IS NULL)));


--
-- Name: uq_collections_user_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_collections_user_inbox ON public.collections USING btree (user_id) WHERE (is_inbox = true);


--
-- Name: uq_deck_cards; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_deck_cards ON public.deck_cards USING btree (deck_id, card_id, zone, preferred_printing_id) NULLS NOT DISTINCT;


--
-- Name: uq_deck_folders_user_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_deck_folders_user_name ON public.deck_folders USING btree (user_id, lower(name));


--
-- Name: uq_decks_family_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_decks_family_primary ON public.decks USING btree (family_id) WHERE (is_primary AND (family_id IS NOT NULL));


--
-- Name: uq_fg_discord_links_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_fg_discord_links_code ON public.friend_group_discord_links USING btree (code) WHERE (code IS NOT NULL);


--
-- Name: uq_fg_discord_links_guild; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_fg_discord_links_guild ON public.friend_group_discord_links USING btree (guild_id) WHERE (guild_id IS NOT NULL);


--
-- Name: uq_fg_discord_links_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_fg_discord_links_pending ON public.friend_group_discord_links USING btree (group_id) WHERE (code IS NOT NULL);


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
-- Name: uq_meta_credits_contribution; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_meta_credits_contribution ON public.meta_credits USING btree (meta_event_id, user_id, meta_event_player_id) NULLS NOT DISTINCT;


--
-- Name: uq_meta_event_matches_seat; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_meta_event_matches_seat ON public.meta_event_matches USING btree (meta_event_id, phase_order, round_number, player1_id) WHERE (source_match_id IS NULL);


--
-- Name: uq_meta_event_matches_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_meta_event_matches_source ON public.meta_event_matches USING btree (meta_event_id, source_match_id) WHERE (source_match_id IS NOT NULL);


--
-- Name: uq_meta_event_overlays_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_meta_event_overlays_source ON public.meta_event_overlays USING btree (provider, external_id) WHERE (provider IS NOT NULL);


--
-- Name: uq_meta_event_player_overlays_source_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_meta_event_player_overlays_source_key ON public.meta_event_player_overlays USING btree (provider, source_player_key) WHERE (provider IS NOT NULL);


--
-- Name: uq_meta_event_players_source_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_meta_event_players_source_identity ON public.meta_event_players USING btree (meta_event_id, source_identity) WHERE (source_identity IS NOT NULL);


--
-- Name: uq_meta_event_players_uvsgames_player; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_meta_event_players_uvsgames_player ON public.meta_event_players USING btree (meta_event_id, uvsgames_player_id) WHERE (uvsgames_player_id IS NOT NULL);


--
-- Name: uq_meta_event_sources_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_meta_event_sources_key ON public.meta_event_sources USING btree (provider, external_id) WHERE (provider IS NOT NULL);


--
-- Name: uq_meta_submissions_provider_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_meta_submissions_provider_external ON public.meta_submissions USING btree (provider, external_id);


--
-- Name: uq_printing_citations_url; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_printing_citations_url ON public.printing_citations USING btree (printing_id, source_url) WHERE (source_url IS NOT NULL);


--
-- Name: uq_stage_presets_user_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_stage_presets_user_name ON public.stage_presets USING btree (user_id, name);


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
-- Name: card_card_types card_card_types_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER card_card_types_sync AFTER INSERT OR DELETE OR UPDATE ON public.card_card_types DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_card_card_types_sync();


--
-- Name: cards cards_seed_card_types; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER cards_seed_card_types AFTER INSERT ON public.cards DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_cards_seed_card_types();


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
-- Name: card_name_aliases trg_card_name_aliases_norm_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_card_name_aliases_norm_name BEFORE INSERT OR UPDATE OF norm_name ON public.card_name_aliases FOR EACH ROW EXECUTE FUNCTION public.card_name_aliases_set_norm_name();


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
-- Name: conditions trg_conditions_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_conditions_protect_well_known BEFORE DELETE OR UPDATE ON public.conditions FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


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
-- Name: graders trg_graders_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_graders_protect_well_known BEFORE DELETE OR UPDATE ON public.graders FOR EACH ROW EXECUTE FUNCTION public.protect_well_known();


--
-- Name: keywords trg_keywords_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_keywords_protect_well_known BEFORE DELETE OR UPDATE ON public.keywords FOR EACH ROW EXECUTE FUNCTION public.protect_well_known_keyword();


--
-- Name: languages trg_languages_protect_well_known; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_languages_protect_well_known BEFORE DELETE OR UPDATE ON public.languages FOR EACH ROW EXECUTE FUNCTION public.protect_well_known_language();


--
-- Name: marketplace_products trg_marketplace_products_set_norm_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_products_set_norm_name BEFORE INSERT OR UPDATE OF product_name ON public.marketplace_products FOR EACH ROW EXECUTE FUNCTION public.marketplace_products_set_norm_name();


--
-- Name: organization_members trg_organization_members_owner_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_organization_members_owner_guard AFTER DELETE OR UPDATE OF role ON public.organization_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.assert_organization_has_owner();


--
-- Name: organizations trg_organizations_owner_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_organizations_owner_guard AFTER INSERT ON public.organizations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.assert_organization_has_owner();


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
-- Name: users trg_rebalance_organization_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rebalance_organization_owner BEFORE DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.rebalance_organization_owner();


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
-- Name: card_submissions trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.card_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: deck_check_entries trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.deck_check_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: deck_folders trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.deck_folders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: meta_event_matches trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.meta_event_matches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meta_event_overlays trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.meta_event_overlays FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meta_event_phases trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.meta_event_phases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meta_event_player_overlays trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.meta_event_player_overlays FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meta_event_players trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.meta_event_players FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meta_events trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.meta_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meta_submissions trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.meta_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meta_sync_settings trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.meta_sync_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organizations trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: overlay_channels trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.overlay_channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: playloltcg_event_checks trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.playloltcg_event_checks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: playloltcg_shops trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.playloltcg_shops FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: printing_images trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.printing_images FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: printings trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.printings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: provider_settings trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.provider_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: scan_index trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.scan_index FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sessions trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: set_releases trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.set_releases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sets trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stage_presets trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.stage_presets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tag_categories trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.tag_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tag_definitions trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.tag_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tier_lists trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.tier_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: uvsgames_event_checks trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.uvsgames_event_checks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: uvsgames_event_templates trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.uvsgames_event_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: uvsgames_format_mappings trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.uvsgames_format_mappings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: uvsgames_players trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.uvsgames_players FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: uvsgames_stores trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.uvsgames_stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: verifications trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.verifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: friend_groups trg_snapshot_deleted_group_names; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_snapshot_deleted_group_names BEFORE DELETE ON public.friend_groups FOR EACH ROW EXECUTE FUNCTION public.snapshot_deleted_group_names();


--
-- Name: users trg_snapshot_deleted_user_names; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_snapshot_deleted_user_names BEFORE DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.snapshot_deleted_user_names();


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
-- Name: admin_grants admin_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_grants
    ADD CONSTRAINT admin_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admins admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_reference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_reference_id_fkey FOREIGN KEY (reference_id) REFERENCES public.users(id) ON DELETE CASCADE;


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
-- Name: card_card_types card_card_types_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_card_types
    ADD CONSTRAINT card_card_types_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;


--
-- Name: card_card_types card_card_types_type_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_card_types
    ADD CONSTRAINT card_card_types_type_slug_fkey FOREIGN KEY (type_slug) REFERENCES public.card_types(slug);


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
-- Name: card_submissions card_submissions_accepted_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_submissions
    ADD CONSTRAINT card_submissions_accepted_card_id_fkey FOREIGN KEY (accepted_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: card_submissions card_submissions_candidate_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_submissions
    ADD CONSTRAINT card_submissions_candidate_card_id_fkey FOREIGN KEY (candidate_card_id) REFERENCES public.candidate_cards(id) ON DELETE SET NULL;


--
-- Name: card_submissions card_submissions_resolved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_submissions
    ADD CONSTRAINT card_submissions_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: card_submissions card_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_submissions
    ADD CONSTRAINT card_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


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
-- Name: card_tokens card_tokens_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_tokens
    ADD CONSTRAINT card_tokens_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;


--
-- Name: card_tokens card_tokens_token_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_tokens
    ADD CONSTRAINT card_tokens_token_card_id_fkey FOREIGN KEY (token_card_id) REFERENCES public.cards(id) ON DELETE CASCADE;


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
    ADD CONSTRAINT card_trades_giver_user_id_fkey FOREIGN KEY (giver_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: card_trades card_trades_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trades
    ADD CONSTRAINT card_trades_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.friend_groups(id) ON DELETE SET NULL;


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
    ADD CONSTRAINT card_trades_receiver_user_id_fkey FOREIGN KEY (receiver_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: copies copies_condition_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT copies_condition_fkey FOREIGN KEY (condition) REFERENCES public.conditions(slug);


--
-- Name: copies copies_grader_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT copies_grader_fkey FOREIGN KEY (grader) REFERENCES public.graders(slug);


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
-- Name: deck_folders deck_folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_folders
    ADD CONSTRAINT deck_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


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
-- Name: decks decks_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE SET NULL;


--
-- Name: decks decks_cover_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_cover_card_id_fkey FOREIGN KEY (cover_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: decks decks_cover_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_cover_printing_id_fkey FOREIGN KEY (cover_printing_id) REFERENCES public.printings(id) ON DELETE SET NULL;


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
-- Name: card_trades fk_card_trades_printing_card; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_trades
    ADD CONSTRAINT fk_card_trades_printing_card FOREIGN KEY (printing_id, card_id) REFERENCES public.printings(id, card_id);


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
-- Name: collection_sidebar_prefs fk_collection_sidebar_prefs_collection; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_sidebar_prefs
    ADD CONSTRAINT fk_collection_sidebar_prefs_collection FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;


--
-- Name: collection_sidebar_prefs fk_collection_sidebar_prefs_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_sidebar_prefs
    ADD CONSTRAINT fk_collection_sidebar_prefs_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: copies fk_copies_collection; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copies
    ADD CONSTRAINT fk_copies_collection FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;


--
-- Name: deck_cards fk_deck_cards_printing_card; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_cards
    ADD CONSTRAINT fk_deck_cards_printing_card FOREIGN KEY (preferred_printing_id, card_id) REFERENCES public.printings(id, card_id);


--
-- Name: deck_cards fk_deck_cards_zone; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_cards
    ADD CONSTRAINT fk_deck_cards_zone FOREIGN KEY (zone) REFERENCES public.deck_zones(slug);


--
-- Name: deck_check_entry_cards fk_deck_check_entry_cards_printing_card; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_check_entry_cards
    ADD CONSTRAINT fk_deck_check_entry_cards_printing_card FOREIGN KEY (resolved_printing_id, resolved_card_id) REFERENCES public.printings(id, card_id);


--
-- Name: deck_folder_entries fk_deck_folder_entries_deck_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_folder_entries
    ADD CONSTRAINT fk_deck_folder_entries_deck_user FOREIGN KEY (deck_id, user_id) REFERENCES public.decks(id, user_id) ON DELETE CASCADE;


--
-- Name: deck_folder_entries fk_deck_folder_entries_folder_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_folder_entries
    ADD CONSTRAINT fk_deck_folder_entries_folder_user FOREIGN KEY (folder_id, user_id) REFERENCES public.deck_folders(id, user_id) ON DELETE CASCADE;


--
-- Name: decks fk_decks_cover_printing_card; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT fk_decks_cover_printing_card FOREIGN KEY (cover_printing_id, cover_card_id) REFERENCES public.printings(id, card_id);


--
-- Name: decks fk_decks_format; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT fk_decks_format FOREIGN KEY (format) REFERENCES public.deck_formats(slug);


--
-- Name: decks fk_decks_predecessor_deck; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT fk_decks_predecessor_deck FOREIGN KEY (predecessor_deck_id) REFERENCES public.decks(id) ON DELETE SET NULL;


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
-- Name: friend_group_list_shares fk_friend_group_list_shares_list; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_list_shares
    ADD CONSTRAINT fk_friend_group_list_shares_list FOREIGN KEY (list_id, user_id) REFERENCES public.lists(id, user_id) ON DELETE CASCADE;


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
-- Name: loans fk_loans_printing_card; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT fk_loans_printing_card FOREIGN KEY (printing_id, card_id) REFERENCES public.printings(id, card_id);


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
-- Name: printings fk_printings_fallback_image_file; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT fk_printings_fallback_image_file FOREIGN KEY (fallback_image_file_id) REFERENCES public.image_files(id) ON DELETE RESTRICT;


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
-- Name: friend_group_discord_links friend_group_discord_links_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_discord_links
    ADD CONSTRAINT friend_group_discord_links_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: friend_group_discord_links friend_group_discord_links_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_group_discord_links
    ADD CONSTRAINT friend_group_discord_links_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.friend_groups(id) ON DELETE CASCADE;


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
-- Name: loan_copies loan_copies_copy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_copies
    ADD CONSTRAINT loan_copies_copy_id_fkey FOREIGN KEY (copy_id) REFERENCES public.copies(id) ON DELETE CASCADE;


--
-- Name: loan_copies loan_copies_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_copies
    ADD CONSTRAINT loan_copies_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: loans loans_borrower_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_borrower_user_id_fkey FOREIGN KEY (borrower_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: loans loans_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- Name: loans loans_lender_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_lender_user_id_fkey FOREIGN KEY (lender_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: loans loans_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: marketplace_groups marketplace_groups_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_groups
    ADD CONSTRAINT marketplace_groups_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id) ON DELETE SET NULL;


--
-- Name: marketplace_ignored_variants marketplace_ignored_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_ignored_variants
    ADD CONSTRAINT marketplace_ignored_variants_product_id_fkey FOREIGN KEY (marketplace_product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


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
-- Name: meta_credits meta_credits_meta_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_credits
    ADD CONSTRAINT meta_credits_meta_event_id_fkey FOREIGN KEY (meta_event_id) REFERENCES public.meta_events(id) ON DELETE CASCADE;


--
-- Name: meta_credits meta_credits_meta_event_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_credits
    ADD CONSTRAINT meta_credits_meta_event_player_id_fkey FOREIGN KEY (meta_event_player_id) REFERENCES public.meta_event_players(id) ON DELETE CASCADE;


--
-- Name: meta_credits meta_credits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_credits
    ADD CONSTRAINT meta_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: meta_event_matches meta_event_matches_meta_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_matches
    ADD CONSTRAINT meta_event_matches_meta_event_id_fkey FOREIGN KEY (meta_event_id) REFERENCES public.meta_events(id) ON DELETE CASCADE;


--
-- Name: meta_event_matches meta_event_matches_player1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_matches
    ADD CONSTRAINT meta_event_matches_player1_id_fkey FOREIGN KEY (player1_id) REFERENCES public.meta_event_players(id) ON DELETE CASCADE;


--
-- Name: meta_event_matches meta_event_matches_player2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_matches
    ADD CONSTRAINT meta_event_matches_player2_id_fkey FOREIGN KEY (player2_id) REFERENCES public.meta_event_players(id) ON DELETE CASCADE;


--
-- Name: meta_event_matches meta_event_matches_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_matches
    ADD CONSTRAINT meta_event_matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.meta_event_players(id) ON DELETE CASCADE;


--
-- Name: meta_event_overlays meta_event_overlays_meta_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_overlays
    ADD CONSTRAINT meta_event_overlays_meta_event_id_fkey FOREIGN KEY (meta_event_id) REFERENCES public.meta_events(id) ON DELETE CASCADE;


--
-- Name: meta_event_overlays meta_event_overlays_submitted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_overlays
    ADD CONSTRAINT meta_event_overlays_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES public.users(id);


--
-- Name: meta_event_phases meta_event_phases_meta_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_phases
    ADD CONSTRAINT meta_event_phases_meta_event_id_fkey FOREIGN KEY (meta_event_id) REFERENCES public.meta_events(id) ON DELETE CASCADE;


--
-- Name: meta_event_player_overlay_cards meta_event_player_overlay_cards_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlay_cards
    ADD CONSTRAINT meta_event_player_overlay_cards_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: meta_event_player_overlay_cards meta_event_player_overlay_cards_overlay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlay_cards
    ADD CONSTRAINT meta_event_player_overlay_cards_overlay_id_fkey FOREIGN KEY (overlay_id) REFERENCES public.meta_event_player_overlays(id) ON DELETE CASCADE;


--
-- Name: meta_event_player_overlay_cards meta_event_player_overlay_cards_preferred_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlay_cards
    ADD CONSTRAINT meta_event_player_overlay_cards_preferred_printing_id_fkey FOREIGN KEY (preferred_printing_id) REFERENCES public.printings(id) ON DELETE SET NULL;


--
-- Name: meta_event_player_overlays meta_event_player_overlays_champion_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlays
    ADD CONSTRAINT meta_event_player_overlays_champion_card_id_fkey FOREIGN KEY (champion_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: meta_event_player_overlays meta_event_player_overlays_event_overlay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlays
    ADD CONSTRAINT meta_event_player_overlays_event_overlay_id_fkey FOREIGN KEY (event_overlay_id) REFERENCES public.meta_event_overlays(id) ON DELETE CASCADE;


--
-- Name: meta_event_player_overlays meta_event_player_overlays_legend_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlays
    ADD CONSTRAINT meta_event_player_overlays_legend_card_id_fkey FOREIGN KEY (legend_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: meta_event_player_overlays meta_event_player_overlays_meta_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlays
    ADD CONSTRAINT meta_event_player_overlays_meta_event_id_fkey FOREIGN KEY (meta_event_id) REFERENCES public.meta_events(id) ON DELETE CASCADE;


--
-- Name: meta_event_player_overlays meta_event_player_overlays_meta_event_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlays
    ADD CONSTRAINT meta_event_player_overlays_meta_event_player_id_fkey FOREIGN KEY (meta_event_player_id) REFERENCES public.meta_event_players(id) ON DELETE CASCADE;


--
-- Name: meta_event_player_overlays meta_event_player_overlays_submitted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_player_overlays
    ADD CONSTRAINT meta_event_player_overlays_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES public.users(id);


--
-- Name: meta_event_players meta_event_players_champion_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_players
    ADD CONSTRAINT meta_event_players_champion_card_id_fkey FOREIGN KEY (champion_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: meta_event_players meta_event_players_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_players
    ADD CONSTRAINT meta_event_players_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id) ON DELETE RESTRICT;


--
-- Name: meta_event_players meta_event_players_legend_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_players
    ADD CONSTRAINT meta_event_players_legend_card_id_fkey FOREIGN KEY (legend_card_id) REFERENCES public.cards(id) ON DELETE SET NULL;


--
-- Name: meta_event_players meta_event_players_meta_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_players
    ADD CONSTRAINT meta_event_players_meta_event_id_fkey FOREIGN KEY (meta_event_id) REFERENCES public.meta_events(id) ON DELETE CASCADE;


--
-- Name: meta_event_players meta_event_players_minted_by_overlay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_players
    ADD CONSTRAINT meta_event_players_minted_by_overlay_id_fkey FOREIGN KEY (minted_by_overlay_id) REFERENCES public.meta_event_player_overlays(id) ON DELETE SET NULL;


--
-- Name: meta_event_players meta_event_players_uvsgames_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_players
    ADD CONSTRAINT meta_event_players_uvsgames_player_id_fkey FOREIGN KEY (uvsgames_player_id) REFERENCES public.uvsgames_players(id);


--
-- Name: meta_event_sources meta_event_sources_meta_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_event_sources
    ADD CONSTRAINT meta_event_sources_meta_event_id_fkey FOREIGN KEY (meta_event_id) REFERENCES public.meta_events(id) ON DELETE CASCADE;


--
-- Name: meta_events meta_events_format_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_events
    ADD CONSTRAINT meta_events_format_fkey FOREIGN KEY (format) REFERENCES public.deck_formats(slug);


--
-- Name: meta_submissions meta_submissions_accepted_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_submissions
    ADD CONSTRAINT meta_submissions_accepted_deck_id_fkey FOREIGN KEY (accepted_deck_id) REFERENCES public.decks(id) ON DELETE SET NULL;


--
-- Name: meta_submissions meta_submissions_meta_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_submissions
    ADD CONSTRAINT meta_submissions_meta_event_id_fkey FOREIGN KEY (meta_event_id) REFERENCES public.meta_events(id) ON DELETE SET NULL;


--
-- Name: meta_submissions meta_submissions_player_overlay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_submissions
    ADD CONSTRAINT meta_submissions_player_overlay_id_fkey FOREIGN KEY (player_overlay_id) REFERENCES public.meta_event_player_overlays(id) ON DELETE SET NULL;


--
-- Name: meta_submissions meta_submissions_resolved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_submissions
    ADD CONSTRAINT meta_submissions_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: meta_submissions meta_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_submissions
    ADD CONSTRAINT meta_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


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
-- Name: overlay_channels overlay_channels_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overlay_channels
    ADD CONSTRAINT overlay_channels_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: playloltcg_decklist_cards playloltcg_decklist_cards_source_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_decklist_cards
    ADD CONSTRAINT playloltcg_decklist_cards_source_deck_id_fkey FOREIGN KEY (source_deck_id) REFERENCES public.playloltcg_decklists(source_deck_id) ON DELETE CASCADE;


--
-- Name: playloltcg_decklists playloltcg_decklists_activity_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_decklists
    ADD CONSTRAINT playloltcg_decklists_activity_shop_id_fkey FOREIGN KEY (activity_shop_id) REFERENCES public.playloltcg_events(activity_shop_id) ON DELETE CASCADE;


--
-- Name: playloltcg_event_checks playloltcg_event_checks_activity_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_event_checks
    ADD CONSTRAINT playloltcg_event_checks_activity_shop_id_fkey FOREIGN KEY (activity_shop_id) REFERENCES public.playloltcg_events(activity_shop_id) ON DELETE CASCADE;


--
-- Name: playloltcg_event_standings playloltcg_event_standings_activity_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_event_standings
    ADD CONSTRAINT playloltcg_event_standings_activity_shop_id_fkey FOREIGN KEY (activity_shop_id) REFERENCES public.playloltcg_events(activity_shop_id) ON DELETE CASCADE;


--
-- Name: playloltcg_events playloltcg_events_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playloltcg_events
    ADD CONSTRAINT playloltcg_events_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.playloltcg_shops(id);


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
-- Name: printing_citations printing_citations_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printing_citations
    ADD CONSTRAINT printing_citations_printing_id_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id) ON DELETE CASCADE;


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
    ADD CONSTRAINT printings_language_fk FOREIGN KEY (language) REFERENCES public.languages(code) ON UPDATE CASCADE;


--
-- Name: printings printings_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printings
    ADD CONSTRAINT printings_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id);


--
-- Name: product_printings product_printings_printing_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_printings
    ADD CONSTRAINT product_printings_printing_fkey FOREIGN KEY (printing_id) REFERENCES public.printings(id);


--
-- Name: product_printings product_printings_product_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_printings
    ADD CONSTRAINT product_printings_product_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id) ON DELETE SET NULL;


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
-- Name: set_releases set_releases_language_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_releases
    ADD CONSTRAINT set_releases_language_fkey FOREIGN KEY (language) REFERENCES public.languages(code) ON UPDATE CASCADE;


--
-- Name: set_releases set_releases_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_releases
    ADD CONSTRAINT set_releases_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id) ON DELETE CASCADE;


--
-- Name: stage_presets stage_presets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_presets
    ADD CONSTRAINT stage_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tag_definitions tag_definitions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_definitions
    ADD CONSTRAINT tag_definitions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.tag_categories(id) ON DELETE RESTRICT;


--
-- Name: tier_lists tier_lists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_lists
    ADD CONSTRAINT tier_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tournament_participants tournament_participants_team_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_participants
    ADD CONSTRAINT tournament_participants_team_fkey FOREIGN KEY (team_id, tournament_id) REFERENCES public.tournament_teams(id, tournament_id) ON DELETE SET NULL (team_id);


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
-- Name: tournament_teams tournament_teams_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_tournament_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


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
-- Name: uvsgames_decklist_cards uvsgames_decklist_cards_source_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_decklist_cards
    ADD CONSTRAINT uvsgames_decklist_cards_source_deck_id_fkey FOREIGN KEY (source_deck_id) REFERENCES public.uvsgames_decklists(source_deck_id) ON DELETE CASCADE;


--
-- Name: uvsgames_decklists uvsgames_decklists_external_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_decklists
    ADD CONSTRAINT uvsgames_decklists_external_id_fkey FOREIGN KEY (external_id) REFERENCES public.uvsgames_events(external_id) ON DELETE CASCADE;


--
-- Name: uvsgames_event_checks uvsgames_event_checks_external_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_checks
    ADD CONSTRAINT uvsgames_event_checks_external_id_fkey FOREIGN KEY (external_id) REFERENCES public.uvsgames_events(external_id) ON DELETE CASCADE;


--
-- Name: uvsgames_event_matches uvsgames_event_matches_external_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_matches
    ADD CONSTRAINT uvsgames_event_matches_external_id_fkey FOREIGN KEY (external_id) REFERENCES public.uvsgames_events(external_id) ON DELETE CASCADE;


--
-- Name: uvsgames_event_matches uvsgames_event_matches_player1_uvsgames_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_matches
    ADD CONSTRAINT uvsgames_event_matches_player1_uvsgames_id_fkey FOREIGN KEY (player1_uvsgames_id) REFERENCES public.uvsgames_players(id);


--
-- Name: uvsgames_event_matches uvsgames_event_matches_player2_uvsgames_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_matches
    ADD CONSTRAINT uvsgames_event_matches_player2_uvsgames_id_fkey FOREIGN KEY (player2_uvsgames_id) REFERENCES public.uvsgames_players(id);


--
-- Name: uvsgames_event_matches uvsgames_event_matches_winner_uvsgames_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_matches
    ADD CONSTRAINT uvsgames_event_matches_winner_uvsgames_id_fkey FOREIGN KEY (winner_uvsgames_id) REFERENCES public.uvsgames_players(id);


--
-- Name: uvsgames_event_phases uvsgames_event_phases_external_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_phases
    ADD CONSTRAINT uvsgames_event_phases_external_id_fkey FOREIGN KEY (external_id) REFERENCES public.uvsgames_events(external_id) ON DELETE CASCADE;


--
-- Name: uvsgames_event_standings uvsgames_event_standings_external_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_standings
    ADD CONSTRAINT uvsgames_event_standings_external_id_fkey FOREIGN KEY (external_id) REFERENCES public.uvsgames_events(external_id) ON DELETE CASCADE;


--
-- Name: uvsgames_event_standings uvsgames_event_standings_uvsgames_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_event_standings
    ADD CONSTRAINT uvsgames_event_standings_uvsgames_player_id_fkey FOREIGN KEY (uvsgames_player_id) REFERENCES public.uvsgames_players(id);


--
-- Name: uvsgames_events uvsgames_events_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_events
    ADD CONSTRAINT uvsgames_events_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.uvsgames_stores(id);


--
-- Name: uvsgames_format_mappings uvsgames_format_mappings_mapped_format_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uvsgames_format_mappings
    ADD CONSTRAINT uvsgames_format_mappings_mapped_format_fkey FOREIGN KEY (mapped_format) REFERENCES public.deck_formats(slug);


--
-- PostgreSQL database dump complete
--

\unrestrict cDrQnrNSemgeCQQ7DcebmbobbWk6TH0Ds6ZLUOvCwegnjBFpQqHJYNkPPiOLpkl

