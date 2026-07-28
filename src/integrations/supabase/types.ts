export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      candidate_sites: {
        Row: {
          address: string | null
          area_sqm: number | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          listing_url: string | null
          location: unknown
          notes: string | null
          organisation_id: string
          planning_use_status: string | null
          public_door_location: unknown
          rent: number | null
          site_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          area_sqm?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          listing_url?: string | null
          location?: unknown
          notes?: string | null
          organisation_id: string
          planning_use_status?: string | null
          public_door_location?: unknown
          rent?: number | null
          site_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          area_sqm?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          listing_url?: string | null
          location?: unknown
          notes?: string | null
          organisation_id?: string
          planning_use_status?: string | null
          public_door_location?: unknown
          rent?: number | null
          site_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_sites_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          occurred_at: string
          organisation_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organisation_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organisation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_audit_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_entity_conflicts: {
        Row: {
          category: string
          created_at: string
          entity_id: string
          field_name: string
          id: string
          import_run_id: string | null
          incoming_source_id: string | null
          incoming_value: Json | null
          incumbent_source_id: string | null
          incumbent_value: Json | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          category: string
          created_at?: string
          entity_id: string
          field_name: string
          id?: string
          import_run_id?: string | null
          incoming_source_id?: string | null
          incoming_value?: Json | null
          incumbent_source_id?: string | null
          incumbent_value?: Json | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          category?: string
          created_at?: string
          entity_id?: string
          field_name?: string
          id?: string
          import_run_id?: string | null
          incoming_source_id?: string | null
          incoming_value?: Json | null
          incumbent_source_id?: string | null
          incumbent_value?: Json | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_entity_conflicts_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "external_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_entity_conflicts_incoming_source_id_fkey"
            columns: ["incoming_source_id"]
            isOneToOne: false
            referencedRelation: "external_source_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_entity_conflicts_incumbent_source_id_fkey"
            columns: ["incumbent_source_id"]
            isOneToOne: false
            referencedRelation: "external_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      external_import_runs: {
        Row: {
          approximate_geocode_count: number
          category: string
          conflict_count: number
          created_at: string
          dataset_version: string | null
          duplicate_candidate_count: number
          error_summary: string | null
          exact_geocode_count: number
          fetched_count: number
          finished_at: string | null
          id: string
          imported_count: number
          metrics: Json
          rejected_count: number
          source_id: string
          stale_count: number
          started_at: string
          status: string
        }
        Insert: {
          approximate_geocode_count?: number
          category: string
          conflict_count?: number
          created_at?: string
          dataset_version?: string | null
          duplicate_candidate_count?: number
          error_summary?: string | null
          exact_geocode_count?: number
          fetched_count?: number
          finished_at?: string | null
          id?: string
          imported_count?: number
          metrics?: Json
          rejected_count?: number
          source_id: string
          stale_count?: number
          started_at?: string
          status: string
        }
        Update: {
          approximate_geocode_count?: number
          category?: string
          conflict_count?: number
          created_at?: string
          dataset_version?: string | null
          duplicate_candidate_count?: number
          error_summary?: string | null
          exact_geocode_count?: number
          fetched_count?: number
          finished_at?: string | null
          id?: string
          imported_count?: number
          metrics?: Json
          rejected_count?: number
          source_id?: string
          stale_count?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_import_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "external_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      external_raw_records: {
        Row: {
          category: string
          created_at: string
          dataset_version: string | null
          disposition: string
          fetched_at: string
          id: string
          import_run_id: string
          observed_at: string | null
          raw_payload: Json
          record_hash: string
          rejection_reason: string | null
          source_id: string
          source_record_id: string
          source_url: string | null
        }
        Insert: {
          category: string
          created_at?: string
          dataset_version?: string | null
          disposition: string
          fetched_at: string
          id?: string
          import_run_id: string
          observed_at?: string | null
          raw_payload: Json
          record_hash: string
          rejection_reason?: string | null
          source_id: string
          source_record_id: string
          source_url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          dataset_version?: string | null
          disposition?: string
          fetched_at?: string
          id?: string
          import_run_id?: string
          observed_at?: string | null
          raw_payload?: Json
          record_hash?: string
          rejection_reason?: string | null
          source_id?: string
          source_record_id?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_raw_records_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "external_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_raw_records_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "external_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      external_source_coverage: {
        Row: {
          category: string
          coverage_geometry: unknown
          coverage_name: string
          coverage_status: string
          fetched_at: string
          id: string
          notes: string | null
          observed_at: string | null
          source_id: string
        }
        Insert: {
          category: string
          coverage_geometry?: unknown
          coverage_name: string
          coverage_status: string
          fetched_at: string
          id?: string
          notes?: string | null
          observed_at?: string | null
          source_id: string
        }
        Update: {
          category?: string
          coverage_geometry?: unknown
          coverage_name?: string
          coverage_status?: string
          fetched_at?: string
          id?: string
          notes?: string | null
          observed_at?: string | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_source_coverage_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "external_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      external_source_registry: {
        Row: {
          attribution_text: string | null
          created_at: string
          dataset_url: string
          geographic_coverage: string | null
          id: string
          licence_name: string | null
          licence_url: string | null
          name: string
          priority: number
          source_key: string
          terms_status: string
          updated_at: string
        }
        Insert: {
          attribution_text?: string | null
          created_at?: string
          dataset_url: string
          geographic_coverage?: string | null
          id?: string
          licence_name?: string | null
          licence_url?: string | null
          name: string
          priority?: number
          source_key: string
          terms_status: string
          updated_at?: string
        }
        Update: {
          attribution_text?: string | null
          created_at?: string
          dataset_url?: string
          geographic_coverage?: string | null
          id?: string
          licence_name?: string | null
          licence_url?: string | null
          name?: string
          priority?: number
          source_key?: string
          terms_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      medical_centres: {
        Row: {
          address: string | null
          boundary: unknown
          coordinate_confidence: number
          coordinate_method: string
          created_at: string
          fetched_at: string
          geographic_coverage: string | null
          id: string
          import_run_id: string
          known_practitioners: Json | null
          licence_status: string
          location: unknown
          name: string
          normalised_address: string | null
          normalised_name: string
          observed_at: string | null
          opening_hours: string | null
          practitioner_evidence_source: string | null
          raw_record_id: string | null
          services: Json | null
          source_dataset_version: string | null
          source_id: string
          source_record_id: string
          source_url: string | null
          trading_name: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["external_verification_status"]
        }
        Insert: {
          address?: string | null
          boundary?: unknown
          coordinate_confidence: number
          coordinate_method: string
          created_at?: string
          fetched_at: string
          geographic_coverage?: string | null
          id?: string
          import_run_id: string
          known_practitioners?: Json | null
          licence_status: string
          location: unknown
          name: string
          normalised_address?: string | null
          normalised_name: string
          observed_at?: string | null
          opening_hours?: string | null
          practitioner_evidence_source?: string | null
          raw_record_id?: string | null
          services?: Json | null
          source_dataset_version?: string | null
          source_id: string
          source_record_id: string
          source_url?: string | null
          trading_name?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["external_verification_status"]
        }
        Update: {
          address?: string | null
          boundary?: unknown
          coordinate_confidence?: number
          coordinate_method?: string
          created_at?: string
          fetched_at?: string
          geographic_coverage?: string | null
          id?: string
          import_run_id?: string
          known_practitioners?: Json | null
          licence_status?: string
          location?: unknown
          name?: string
          normalised_address?: string | null
          normalised_name?: string
          observed_at?: string | null
          opening_hours?: string | null
          practitioner_evidence_source?: string | null
          raw_record_id?: string | null
          services?: Json | null
          source_dataset_version?: string | null
          source_id?: string
          source_record_id?: string
          source_url?: string | null
          trading_name?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["external_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "medical_centres_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "external_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_centres_raw_record_id_fkey"
            columns: ["raw_record_id"]
            isOneToOne: false
            referencedRelation: "external_raw_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_centres_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "external_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          business_id: string | null
          candidate_site_id: string | null
          created_at: string
          created_by: string | null
          id: string
          organisation_id: string
          origin_approval_id: string | null
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          summary: string | null
          title: string
          type: Database["public"]["Enums"]["opportunity_type"]
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          candidate_site_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id: string
          origin_approval_id?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          summary?: string | null
          title: string
          type: Database["public"]["Enums"]["opportunity_type"]
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          candidate_site_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id?: string
          origin_approval_id?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          summary?: string | null
          title?: string
          type?: Database["public"]["Enums"]["opportunity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_candidate_site_id_fkey"
            columns: ["candidate_site_id"]
            isOneToOne: false
            referencedRelation: "candidate_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_origin_approval_id_fkey"
            columns: ["origin_approval_id"]
            isOneToOne: false
            referencedRelation: "pbs_approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_members: {
        Row: {
          joined_at: string
          organisation_id: string
          role: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          organisation_id: string
          role?: string
          user_id: string
        }
        Update: {
          joined_at?: string
          organisation_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_members_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pbs_approvals: {
        Row: {
          approval_number: string
          approval_source_id: string | null
          approval_status: Database["public"]["Enums"]["verification_status"]
          created_at: string
          id: string
          notes: string | null
          original_approval_date: string | null
          original_rule_item: string | null
          original_town: string | null
          premises_id: string | null
          source_confidence: string | null
          updated_at: string
        }
        Insert: {
          approval_number: string
          approval_source_id?: string | null
          approval_status?: Database["public"]["Enums"]["verification_status"]
          created_at?: string
          id?: string
          notes?: string | null
          original_approval_date?: string | null
          original_rule_item?: string | null
          original_town?: string | null
          premises_id?: string | null
          source_confidence?: string | null
          updated_at?: string
        }
        Update: {
          approval_number?: string
          approval_source_id?: string | null
          approval_status?: Database["public"]["Enums"]["verification_status"]
          created_at?: string
          id?: string
          notes?: string | null
          original_approval_date?: string | null
          original_rule_item?: string | null
          original_town?: string | null
          premises_id?: string | null
          source_confidence?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbs_approvals_approval_source_id_fkey"
            columns: ["approval_source_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbs_approvals_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbs_approvals_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_businesses: {
        Row: {
          asking_price: number | null
          broker_or_source: string | null
          canonical_address_snapshot: string | null
          canonical_name_snapshot: string | null
          created_at: string
          created_by: string | null
          date_first_seen: string | null
          id: string
          listing_status: string
          listing_url: string | null
          opportunity_status: string | null
          organisation_id: string
          premises_id: string | null
          private_notes: string | null
          trading_name: string
          updated_at: string
        }
        Insert: {
          asking_price?: number | null
          broker_or_source?: string | null
          canonical_address_snapshot?: string | null
          canonical_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          date_first_seen?: string | null
          id?: string
          listing_status?: string
          listing_url?: string | null
          opportunity_status?: string | null
          organisation_id: string
          premises_id?: string | null
          private_notes?: string | null
          trading_name: string
          updated_at?: string
        }
        Update: {
          asking_price?: number | null
          broker_or_source?: string | null
          canonical_address_snapshot?: string | null
          canonical_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          date_first_seen?: string | null
          id?: string
          listing_status?: string
          listing_url?: string | null
          opportunity_status?: string | null
          organisation_id?: string
          premises_id?: string | null
          private_notes?: string | null
          trading_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_businesses_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_businesses_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_businesses_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_im_attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          file_name: string
          id: string
          mime_type: string | null
          organisation_id: string | null
          orphaned_demo: boolean
          pharmacy_profile_id: string
          premises_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          organisation_id?: string | null
          orphaned_demo?: boolean
          pharmacy_profile_id: string
          premises_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          organisation_id?: string | null
          orphaned_demo?: boolean
          pharmacy_profile_id?: string
          premises_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_im_attachments_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_im_attachments_pharmacy_profile_id_fkey"
            columns: ["pharmacy_profile_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_im_attachments_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_im_attachments_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_import_rows: {
        Row: {
          disposition: string
          geocode_confidence: string | null
          geocode_method: string | null
          geocode_provider: string | null
          id: string
          imported_at: string
          matching_key: string
          normalized_payload: Json
          premises_id: string | null
          raw_payload: Json
          source_name: string
          source_row_number: number
          updated_at: string
          warnings: Json
        }
        Insert: {
          disposition: string
          geocode_confidence?: string | null
          geocode_method?: string | null
          geocode_provider?: string | null
          id?: string
          imported_at?: string
          matching_key: string
          normalized_payload: Json
          premises_id?: string | null
          raw_payload: Json
          source_name: string
          source_row_number: number
          updated_at?: string
          warnings?: Json
        }
        Update: {
          disposition?: string
          geocode_confidence?: string | null
          geocode_method?: string | null
          geocode_provider?: string | null
          id?: string
          imported_at?: string
          matching_key?: string
          normalized_payload?: Json
          premises_id?: string | null
          raw_payload?: Json
          source_name?: string
          source_row_number?: number
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_import_rows_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_import_rows_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_note_entries: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note_text: string
          organisation_id: string | null
          orphaned_demo: boolean
          pharmacy_profile_id: string
          premises_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note_text: string
          organisation_id?: string | null
          orphaned_demo?: boolean
          pharmacy_profile_id: string
          premises_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note_text?: string
          organisation_id?: string | null
          orphaned_demo?: boolean
          pharmacy_profile_id?: string
          premises_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_note_entries_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_note_entries_pharmacy_profile_id_fkey"
            columns: ["pharmacy_profile_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_note_entries_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_note_entries_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_premises: {
        Row: {
          address: string
          created_at: string
          door_confidence: string | null
          door_source: Database["public"]["Enums"]["door_source"] | null
          door_verified_at: string | null
          door_verified_by: string | null
          geocode_method: string | null
          id: string
          locality_name: string | null
          location: unknown
          name: string
          notes: string | null
          phone: string | null
          postcode: string | null
          premises_source: Database["public"]["Enums"]["premises_source_type"]
          public_door_location: unknown
          source_confidence: string | null
          source_id: string | null
          suburb: string | null
          updated_at: string
          vpa_registration_checked_at: string | null
          vpa_registration_status: Database["public"]["Enums"]["verification_status"]
          vpa_source_id: string | null
          website: string | null
        }
        Insert: {
          address: string
          created_at?: string
          door_confidence?: string | null
          door_source?: Database["public"]["Enums"]["door_source"] | null
          door_verified_at?: string | null
          door_verified_by?: string | null
          geocode_method?: string | null
          id?: string
          locality_name?: string | null
          location?: unknown
          name: string
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          premises_source: Database["public"]["Enums"]["premises_source_type"]
          public_door_location?: unknown
          source_confidence?: string | null
          source_id?: string | null
          suburb?: string | null
          updated_at?: string
          vpa_registration_checked_at?: string | null
          vpa_registration_status?: Database["public"]["Enums"]["verification_status"]
          vpa_source_id?: string | null
          website?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          door_confidence?: string | null
          door_source?: Database["public"]["Enums"]["door_source"] | null
          door_verified_at?: string | null
          door_verified_by?: string | null
          geocode_method?: string | null
          id?: string
          locality_name?: string | null
          location?: unknown
          name?: string
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          premises_source?: Database["public"]["Enums"]["premises_source_type"]
          public_door_location?: unknown
          source_confidence?: string | null
          source_id?: string | null
          suburb?: string | null
          updated_at?: string
          vpa_registration_checked_at?: string | null
          vpa_registration_status?: Database["public"]["Enums"]["verification_status"]
          vpa_source_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_premises_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_premises_vpa_source_id_fkey"
            columns: ["vpa_source_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_profiles: {
        Row: {
          asking_price: number | null
          created_at: string
          created_by: string | null
          id: string
          notes: string
          notes_updated_at: string | null
          notes_updated_by: string | null
          organisation_id: string | null
          orphaned_demo: boolean
          owner_licensee: string | null
          premises_id: string
          revenue: number | null
          script_volume: number | null
          status: Database["public"]["Enums"]["pharmacy_tracker_status"]
          updated_at: string
        }
        Insert: {
          asking_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string
          notes_updated_at?: string | null
          notes_updated_by?: string | null
          organisation_id?: string | null
          orphaned_demo?: boolean
          owner_licensee?: string | null
          premises_id: string
          revenue?: number | null
          script_volume?: number | null
          status?: Database["public"]["Enums"]["pharmacy_tracker_status"]
          updated_at?: string
        }
        Update: {
          asking_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string
          notes_updated_at?: string | null
          notes_updated_by?: string | null
          organisation_id?: string | null
          orphaned_demo?: boolean
          owner_licensee?: string | null
          premises_id?: string
          revenue?: number | null
          script_volume?: number | null
          status?: Database["public"]["Enums"]["pharmacy_tracker_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_profiles_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_profiles_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_profiles_premises_id_fkey"
            columns: ["premises_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          current_organisation_id: string | null
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_organisation_id?: string | null
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_organisation_id?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_organisation_id_fkey"
            columns: ["current_organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      relocation_scenarios: {
        Row: {
          actor_id: string | null
          created_at: string
          destination_address: string | null
          destination_door_point: unknown
          destination_location: unknown
          id: string
          inputs: Json
          organisation_id: string | null
          origin_pharmacy_id: string | null
          orphaned_demo: boolean
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          destination_address?: string | null
          destination_door_point?: unknown
          destination_location?: unknown
          id?: string
          inputs?: Json
          organisation_id?: string | null
          origin_pharmacy_id?: string | null
          orphaned_demo?: boolean
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          destination_address?: string | null
          destination_door_point?: unknown
          destination_location?: unknown
          id?: string
          inputs?: Json
          organisation_id?: string | null
          origin_pharmacy_id?: string | null
          orphaned_demo?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relocation_scenarios_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relocation_scenarios_origin_pharmacy_id_fkey"
            columns: ["origin_pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relocation_scenarios_origin_pharmacy_id_fkey"
            columns: ["origin_pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_premises_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_evaluations: {
        Row: {
          assumptions: Json
          calculated_value: number | null
          created_at: string
          detail: Json
          id: string
          requirement_id: string
          rule_evaluation_id: string
          sources: Json
          status: Database["public"]["Enums"]["rule_result_status"]
          threshold: number | null
        }
        Insert: {
          assumptions?: Json
          calculated_value?: number | null
          created_at?: string
          detail?: Json
          id?: string
          requirement_id: string
          rule_evaluation_id: string
          sources?: Json
          status: Database["public"]["Enums"]["rule_result_status"]
          threshold?: number | null
        }
        Update: {
          assumptions?: Json
          calculated_value?: number | null
          created_at?: string
          detail?: Json
          id?: string
          requirement_id?: string
          rule_evaluation_id?: string
          sources?: Json
          status?: Database["public"]["Enums"]["rule_result_status"]
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "requirement_evaluations_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "rule_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_evaluations_rule_evaluation_id_fkey"
            columns: ["rule_evaluation_id"]
            isOneToOne: false
            referencedRelation: "rule_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_evaluations: {
        Row: {
          created_at: string
          dataset_snapshot: Json
          evaluated_at: string
          id: string
          rule_id: string
          scenario_id: string
          status: Database["public"]["Enums"]["rule_result_status"]
          summary: Json
        }
        Insert: {
          created_at?: string
          dataset_snapshot?: Json
          evaluated_at?: string
          id?: string
          rule_id: string
          scenario_id: string
          status: Database["public"]["Enums"]["rule_result_status"]
          summary?: Json
        }
        Update: {
          created_at?: string
          dataset_snapshot?: Json
          evaluated_at?: string
          id?: string
          rule_id?: string
          scenario_id?: string
          status?: Database["public"]["Enums"]["rule_result_status"]
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rule_evaluations_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_evaluations_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "relocation_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_requirements: {
        Row: {
          comparison_inclusive: boolean | null
          created_at: string
          data_requirements: Json
          description: string
          evidence_requirements: Json
          id: string
          measurement_type: string | null
          operator: string | null
          reference_citation: string | null
          requirement_code: string
          rule_id: string
          threshold: number | null
          units: string | null
          updated_at: string
        }
        Insert: {
          comparison_inclusive?: boolean | null
          created_at?: string
          data_requirements?: Json
          description: string
          evidence_requirements?: Json
          id?: string
          measurement_type?: string | null
          operator?: string | null
          reference_citation?: string | null
          requirement_code: string
          rule_id: string
          threshold?: number | null
          units?: string | null
          updated_at?: string
        }
        Update: {
          comparison_inclusive?: boolean | null
          created_at?: string
          data_requirements?: Json
          description?: string
          evidence_requirements?: Json
          id?: string
          measurement_type?: string | null
          operator?: string | null
          reference_citation?: string | null
          requirement_code?: string
          rule_id?: string
          threshold?: number | null
          units?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_requirements_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_versions: {
        Row: {
          active: boolean
          checksum: string | null
          created_at: string
          effective_from: string | null
          effective_to: string | null
          handbook_version: string | null
          id: string
          legislative_source: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          checksum?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          handbook_version?: string | null
          id?: string
          legislative_source: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          checksum?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          handbook_version?: string | null
          id?: string
          legislative_source?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      rules: {
        Row: {
          created_at: string
          id: string
          item_number: string
          reference_citation: string | null
          rule_version_id: string
          title: string
          updated_at: string
          workflow_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_number: string
          reference_citation?: string | null
          rule_version_id: string
          title: string
          updated_at?: string
          workflow_type: string
        }
        Update: {
          created_at?: string
          id?: string
          item_number?: string
          reference_citation?: string | null
          rule_version_id?: string
          title?: string
          updated_at?: string
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rules_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      source_records: {
        Row: {
          checksum: string | null
          confidence: string | null
          coverage_description: string | null
          coverage_geometry: unknown
          created_at: string
          fetched_at: string | null
          id: string
          licence_or_terms_status: string | null
          notes: string | null
          regulatory_purpose: string | null
          row_count: number | null
          source_kind: Database["public"]["Enums"]["premises_source_type"]
          source_name: string
          source_url: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          checksum?: string | null
          confidence?: string | null
          coverage_description?: string | null
          coverage_geometry?: unknown
          created_at?: string
          fetched_at?: string | null
          id?: string
          licence_or_terms_status?: string | null
          notes?: string | null
          regulatory_purpose?: string | null
          row_count?: number | null
          source_kind: Database["public"]["Enums"]["premises_source_type"]
          source_name: string
          source_url?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          checksum?: string | null
          confidence?: string | null
          coverage_description?: string | null
          coverage_geometry?: unknown
          created_at?: string
          fetched_at?: string | null
          id?: string
          licence_or_terms_status?: string | null
          notes?: string | null
          regulatory_purpose?: string | null
          row_count?: number | null
          source_kind?: Database["public"]["Enums"]["premises_source_type"]
          source_name?: string
          source_url?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      supermarkets: {
        Row: {
          address: string | null
          boundary: unknown
          brand: string | null
          coordinate_confidence: number
          coordinate_method: string
          created_at: string
          fetched_at: string
          floor_area_source: string | null
          floor_area_sqm: number | null
          geographic_coverage: string | null
          id: string
          import_run_id: string
          licence_status: string
          location: unknown
          name: string
          normalised_address: string | null
          normalised_name: string
          observed_at: string | null
          opening_hours: string | null
          public_entrance: unknown
          raw_record_id: string | null
          source_dataset_version: string | null
          source_id: string
          source_record_id: string
          source_url: string | null
          trading_name: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["external_verification_status"]
        }
        Insert: {
          address?: string | null
          boundary?: unknown
          brand?: string | null
          coordinate_confidence: number
          coordinate_method: string
          created_at?: string
          fetched_at: string
          floor_area_source?: string | null
          floor_area_sqm?: number | null
          geographic_coverage?: string | null
          id?: string
          import_run_id: string
          licence_status: string
          location: unknown
          name: string
          normalised_address?: string | null
          normalised_name: string
          observed_at?: string | null
          opening_hours?: string | null
          public_entrance?: unknown
          raw_record_id?: string | null
          source_dataset_version?: string | null
          source_id: string
          source_record_id: string
          source_url?: string | null
          trading_name?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["external_verification_status"]
        }
        Update: {
          address?: string | null
          boundary?: unknown
          brand?: string | null
          coordinate_confidence?: number
          coordinate_method?: string
          created_at?: string
          fetched_at?: string
          floor_area_source?: string | null
          floor_area_sqm?: number | null
          geographic_coverage?: string | null
          id?: string
          import_run_id?: string
          licence_status?: string
          location?: unknown
          name?: string
          normalised_address?: string | null
          normalised_name?: string
          observed_at?: string | null
          opening_hours?: string | null
          public_entrance?: unknown
          raw_record_id?: string | null
          source_dataset_version?: string | null
          source_id?: string
          source_record_id?: string
          source_url?: string | null
          trading_name?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["external_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "supermarkets_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "external_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supermarkets_raw_record_id_fkey"
            columns: ["raw_record_id"]
            isOneToOne: false
            referencedRelation: "external_raw_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supermarkets_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "external_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      pharmacy_premises_geo: {
        Row: {
          address: string | null
          created_at: string | null
          door_confidence: string | null
          door_lat: number | null
          door_lng: number | null
          door_source: Database["public"]["Enums"]["door_source"] | null
          door_verified_at: string | null
          geocode_method: string | null
          id: string | null
          lat: number | null
          lng: number | null
          locality_name: string | null
          name: string | null
          notes: string | null
          phone: string | null
          postcode: string | null
          premises_source:
            | Database["public"]["Enums"]["premises_source_type"]
            | null
          source_confidence: string | null
          source_id: string | null
          suburb: string | null
          updated_at: string | null
          vpa_registration_checked_at: string | null
          vpa_registration_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          door_confidence?: string | null
          door_lat?: never
          door_lng?: never
          door_source?: Database["public"]["Enums"]["door_source"] | null
          door_verified_at?: string | null
          geocode_method?: string | null
          id?: string | null
          lat?: never
          lng?: never
          locality_name?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          premises_source?:
            | Database["public"]["Enums"]["premises_source_type"]
            | null
          source_confidence?: string | null
          source_id?: string | null
          suburb?: string | null
          updated_at?: string | null
          vpa_registration_checked_at?: string | null
          vpa_registration_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          door_confidence?: string | null
          door_lat?: never
          door_lng?: never
          door_source?: Database["public"]["Enums"]["door_source"] | null
          door_verified_at?: string | null
          geocode_method?: string | null
          id?: string | null
          lat?: never
          lng?: never
          locality_name?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          premises_source?:
            | Database["public"]["Enums"]["premises_source_type"]
            | null
          source_confidence?: string | null
          source_id?: string | null
          suburb?: string | null
          updated_at?: string | null
          vpa_registration_checked_at?: string | null
          vpa_registration_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_premises_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      add_pharmacy_to_pipeline: {
        Args: {
          p_asking_price?: number
          p_broker_or_source?: string
          p_date_first_seen?: string
          p_listing_url?: string
          p_premises_id: string
          p_stage?: Database["public"]["Enums"]["pipeline_stage"]
        }
        Returns: {
          business_id: string
          created: boolean
          opportunity_id: string
        }[]
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      candidate_external_summary: {
        Args: { p_lat: number; p_lng: number }
        Returns: Json
      }
      candidate_external_within_500m: {
        Args: { p_category: string; p_lat: number; p_lng: number }
        Returns: {
          address: string
          calculated_point_distance_m: number
          category: string
          coordinate_confidence: number
          coordinate_method: string
          evidence_fetched_at: string
          id: string
          lat: number
          lng: number
          name: string
          source_name: string
          source_url: string
          unresolved_conflicts: number
          verification_status: string
          warnings: string[]
        }[]
      }
      candidate_nearest_pharmacy: {
        Args: {
          p_confirmed_only?: boolean
          p_lat: number
          p_limit?: number
          p_lng: number
        }
        Returns: {
          address: string
          calculated_point_distance_m: number
          confirmation_basis: string
          coordinate_quality: string
          distance_usable: boolean
          evidence_fetched_at: string
          id: string
          lat: number
          lng: number
          name: string
          source_name: string
          source_url: string
          unresolved_duplicate_candidates: number
          verification_status: string
          warnings: string[]
        }[]
      }
      candidate_pharmacies_within_radius: {
        Args: { p_lat: number; p_lng: number; p_radius_m: number }
        Returns: {
          address: string
          calculated_point_distance_m: number
          coordinate_quality: string
          evidence_fetched_at: string
          id: string
          lat: number
          lng: number
          name: string
          source_name: string
          source_url: string
          verification_status: string
        }[]
      }
      candidate_site_analysis: {
        Args: { p_lat: number; p_lng: number; p_radius_m?: number }
        Returns: Json
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      external_entity_dossier: {
        Args: { p_category: string; p_id: string }
        Returns: Json
      }
      external_points_in_viewport: {
        Args: {
          p_category: string
          p_east: number
          p_limit?: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: {
          address: string
          category: string
          coordinate_confidence: number
          fetched_at: string
          id: string
          lat: number
          lng: number
          name: string
          source_name: string
          source_url: string
          verification_status: string
        }[]
      }
      external_points_in_viewport_v2: {
        Args: {
          p_category: string
          p_east: number
          p_limit?: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: {
          address: string
          category: string
          coordinate_confidence: number
          fetched_at: string
          id: string
          lat: number
          lng: number
          name: string
          source_name: string
          source_url: string
          total_count: number
          verification_status: string
        }[]
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      gettransactionid: { Args: never; Returns: unknown }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_external_location_batch: {
        Args: {
          p_category: string
          p_duplicate_candidates?: Json
          p_fetched_at: string
          p_metrics?: Json
          p_records: Json
          p_rejected?: Json
          p_source_key: string
        }
        Returns: Json
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      organisation_security_status: { Args: never; Returns: Json }
      pharmacy_pipeline_status: {
        Args: { p_premises_id: string }
        Returns: {
          business_id: string
          listing_status: string
          opportunity_id: string
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
        }[]
      }
      pharmacy_pipeline_statuses: {
        Args: { p_premises_ids: string[] }
        Returns: {
          business_id: string
          listing_status: string
          opportunity_id: string
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          premises_id: string
        }[]
      }
      pharmacy_points_in_viewport: {
        Args: {
          p_east: number
          p_limit?: number
          p_metro_only?: boolean
          p_missing_data?: boolean
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: {
          address: string
          geocode_method: string
          id: string
          lat: number
          lng: number
          locality_name: string
          name: string
          postcode: string
          premises_source: Database["public"]["Enums"]["premises_source_type"]
          source_confidence: string
          suburb: string
          total_count: number
          vpa_registration_status: Database["public"]["Enums"]["verification_status"]
        }[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      public_data_freshness: { Args: never; Returns: Json }
      set_premises_door: {
        Args: { _lat: number; _lng: number; _premises_id: string }
        Returns: undefined
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      statewide_location_search: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          is_private: boolean
          lat: number
          lng: number
          relevance: number
          result_address: string
          result_id: string
          result_name: string
          result_postcode: string
          result_suburb: string
          result_type: string
          source_confidence: string
        }[]
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "member"
      door_source: "geocoded" | "osm" | "user_verified" | "imported"
      external_verification_status:
        | "confirmed"
        | "probable"
        | "unverified"
        | "conflicting"
        | "stale"
        | "no_source_coverage"
      opportunity_type: "acquisition" | "greenfield" | "relocation"
      pharmacy_tracker_status:
        | "active"
        | "underperforming"
        | "target"
        | "under_offer"
      pipeline_stage:
        | "watchlist"
        | "contacting"
        | "im_received"
        | "due_diligence"
        | "offer"
        | "passed"
        | "acquired"
      premises_source_type:
        | "healthdirect"
        | "osm"
        | "vpa_register"
        | "pbs_register"
        | "manual"
      rule_result_status:
        | "appears_to_satisfy"
        | "does_not_appear_to_satisfy"
        | "insufficient_evidence"
        | "professional_measurement_required"
        | "not_applicable"
        | "source_coverage_incomplete"
      verification_status: "unverified" | "matched" | "verified" | "conflict"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "member"],
      door_source: ["geocoded", "osm", "user_verified", "imported"],
      external_verification_status: [
        "confirmed",
        "probable",
        "unverified",
        "conflicting",
        "stale",
        "no_source_coverage",
      ],
      opportunity_type: ["acquisition", "greenfield", "relocation"],
      pharmacy_tracker_status: [
        "active",
        "underperforming",
        "target",
        "under_offer",
      ],
      pipeline_stage: [
        "watchlist",
        "contacting",
        "im_received",
        "due_diligence",
        "offer",
        "passed",
        "acquired",
      ],
      premises_source_type: [
        "healthdirect",
        "osm",
        "vpa_register",
        "pbs_register",
        "manual",
      ],
      rule_result_status: [
        "appears_to_satisfy",
        "does_not_appear_to_satisfy",
        "insufficient_evidence",
        "professional_measurement_required",
        "not_applicable",
        "source_coverage_incomplete",
      ],
      verification_status: ["unverified", "matched", "verified", "conflict"],
    },
  },
} as const
