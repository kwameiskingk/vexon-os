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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounting_cards: {
        Row: {
          billing_plan_type: string | null
          client_id: string
          contract_value: number | null
          created_at: string
          id: string
          internal_notes: string | null
          invoice_status: string | null
          next_invoice_date: string | null
          next_payment_due: string | null
          paid_in_full: boolean | null
          payment_method: string | null
          payment_type: string | null
          renewal_date: string | null
          updated_at: string
        }
        Insert: {
          billing_plan_type?: string | null
          client_id: string
          contract_value?: number | null
          created_at?: string
          id?: string
          internal_notes?: string | null
          invoice_status?: string | null
          next_invoice_date?: string | null
          next_payment_due?: string | null
          paid_in_full?: boolean | null
          payment_method?: string | null
          payment_type?: string | null
          renewal_date?: string | null
          updated_at?: string
        }
        Update: {
          billing_plan_type?: string | null
          client_id?: string
          contract_value?: number | null
          created_at?: string
          id?: string
          internal_notes?: string | null
          invoice_status?: string | null
          next_invoice_date?: string | null
          next_payment_due?: string | null
          paid_in_full?: boolean | null
          payment_method?: string | null
          payment_type?: string | null
          renewal_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_records: {
        Row: {
          accounts_email: string | null
          amount: number
          average_payment_delay_days: number | null
          ceased_at: string | null
          client_profile_id: string
          contract_term_months: number | null
          correlation_id: string | null
          created_at: string
          created_by: string | null
          deferral_end_date: string | null
          deferral_reason: string | null
          external_invoice_id: string | null
          external_invoice_number: string | null
          external_invoice_url: string | null
          external_status: string | null
          first_payment_date: string | null
          id: string
          invoice_external_status: string | null
          invoice_number: string
          invoice_url: string | null
          is_ceased: boolean
          is_deferred: boolean | null
          next_payment_due: string | null
          notes: string | null
          on_time_payment_rate: number | null
          original_next_payment_due: string | null
          paid_in_full: boolean | null
          payment_method: Database["public"]["Enums"]["payment_method_type"]
          payments_completed: number | null
          primary_email: string | null
          proof_url: string | null
          receipt_url: string | null
          send_method: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          total_lifetime_value: number | null
          updated_at: string
        }
        Insert: {
          accounts_email?: string | null
          amount: number
          average_payment_delay_days?: number | null
          ceased_at?: string | null
          client_profile_id: string
          contract_term_months?: number | null
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          deferral_end_date?: string | null
          deferral_reason?: string | null
          external_invoice_id?: string | null
          external_invoice_number?: string | null
          external_invoice_url?: string | null
          external_status?: string | null
          first_payment_date?: string | null
          id?: string
          invoice_external_status?: string | null
          invoice_number: string
          invoice_url?: string | null
          is_ceased?: boolean
          is_deferred?: boolean | null
          next_payment_due?: string | null
          notes?: string | null
          on_time_payment_rate?: number | null
          original_next_payment_due?: string | null
          paid_in_full?: boolean | null
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
          payments_completed?: number | null
          primary_email?: string | null
          proof_url?: string | null
          receipt_url?: string | null
          send_method?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          total_lifetime_value?: number | null
          updated_at?: string
        }
        Update: {
          accounts_email?: string | null
          amount?: number
          average_payment_delay_days?: number | null
          ceased_at?: string | null
          client_profile_id?: string
          contract_term_months?: number | null
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          deferral_end_date?: string | null
          deferral_reason?: string | null
          external_invoice_id?: string | null
          external_invoice_number?: string | null
          external_invoice_url?: string | null
          external_status?: string | null
          first_payment_date?: string | null
          id?: string
          invoice_external_status?: string | null
          invoice_number?: string
          invoice_url?: string | null
          is_ceased?: boolean
          is_deferred?: boolean | null
          next_payment_due?: string | null
          notes?: string | null
          on_time_payment_rate?: number | null
          original_next_payment_due?: string | null
          paid_in_full?: boolean | null
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
          payments_completed?: number | null
          primary_email?: string | null
          proof_url?: string | null
          receipt_url?: string | null
          send_method?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          total_lifetime_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_records_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          file_path: string | null
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_path?: string | null
          id?: string
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_path?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      achievement_definitions: {
        Row: {
          category: string
          color: string
          created_at: string | null
          created_by: string | null
          criteria: Json
          description: string
          icon: string
          id: string
          is_active: boolean | null
          is_permanent: boolean | null
          key: string
          name: string
          reset_period: string | null
          sort_order: number | null
          target_department: string | null
          target_role: string
          tier: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          color: string
          created_at?: string | null
          created_by?: string | null
          criteria: Json
          description: string
          icon: string
          id?: string
          is_active?: boolean | null
          is_permanent?: boolean | null
          key: string
          name: string
          reset_period?: string | null
          sort_order?: number | null
          target_department?: string | null
          target_role: string
          tier?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          color?: string
          created_at?: string | null
          created_by?: string | null
          criteria?: Json
          description?: string
          icon?: string
          id?: string
          is_active?: boolean | null
          is_permanent?: boolean | null
          key?: string
          name?: string
          reset_period?: string | null
          sort_order?: number | null
          target_department?: string | null
          target_role?: string
          tier?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      acq_qual_scores: {
        Row: {
          call_date: string | null
          call_id: string | null
          created_at: string
          gate_decision_maker: boolean | null
          gate_decision_maker_evidence: string | null
          gate_educated: boolean | null
          gate_educated_evidence: string | null
          gate_revenue: boolean | null
          gate_revenue_evidence: string | null
          gate_tam: boolean | null
          gate_tam_evidence: string | null
          gate_urgency: boolean | null
          gate_urgency_evidence: string | null
          gates_hit: number | null
          health_flag: boolean
          health_flag_reason: string | null
          id: string
          info_headcount: string | null
          info_prior_leadgen: string | null
          info_years_in_business: string | null
          lead_id: string | null
          meeting_id: string | null
          recording_url: string | null
          reviewer_notes: string | null
          setter_id: string | null
          setter_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          call_date?: string | null
          call_id?: string | null
          created_at?: string
          gate_decision_maker?: boolean | null
          gate_decision_maker_evidence?: string | null
          gate_educated?: boolean | null
          gate_educated_evidence?: string | null
          gate_revenue?: boolean | null
          gate_revenue_evidence?: string | null
          gate_tam?: boolean | null
          gate_tam_evidence?: string | null
          gate_urgency?: boolean | null
          gate_urgency_evidence?: string | null
          gates_hit?: number | null
          health_flag?: boolean
          health_flag_reason?: string | null
          id?: string
          info_headcount?: string | null
          info_prior_leadgen?: string | null
          info_years_in_business?: string | null
          lead_id?: string | null
          meeting_id?: string | null
          recording_url?: string | null
          reviewer_notes?: string | null
          setter_id?: string | null
          setter_name?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          call_date?: string | null
          call_id?: string | null
          created_at?: string
          gate_decision_maker?: boolean | null
          gate_decision_maker_evidence?: string | null
          gate_educated?: boolean | null
          gate_educated_evidence?: string | null
          gate_revenue?: boolean | null
          gate_revenue_evidence?: string | null
          gate_tam?: boolean | null
          gate_tam_evidence?: string | null
          gate_urgency?: boolean | null
          gate_urgency_evidence?: string | null
          gates_hit?: number | null
          health_flag?: boolean
          health_flag_reason?: string | null
          id?: string
          info_headcount?: string | null
          info_prior_leadgen?: string | null
          info_years_in_business?: string | null
          lead_id?: string | null
          meeting_id?: string | null
          recording_url?: string | null
          reviewer_notes?: string | null
          setter_id?: string | null
          setter_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acq_qual_scores_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acq_qual_scores_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_activity_log: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string | null
          details: Json | null
          id: string
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
        }
        Relationships: []
      }
      admin_feedback_entries: {
        Row: {
          author_user_id: string
          created_at: string
          entry_date: string
          eod_text: string | null
          id: string
          internal_notes_thread: Json | null
          updated_at: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          entry_date?: string
          eod_text?: string | null
          id?: string
          internal_notes_thread?: Json | null
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          entry_date?: string
          eod_text?: string | null
          id?: string
          internal_notes_thread?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_messages: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          recipient_id: string | null
          recipient_role: Database["public"]["Enums"]["app_role"] | null
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          recipient_id?: string | null
          recipient_role?: Database["public"]["Enums"]["app_role"] | null
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          recipient_id?: string | null
          recipient_role?: Database["public"]["Enums"]["app_role"] | null
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ae_compensation: {
        Row: {
          base_salary: number | null
          cash_collected_goal: number | null
          commission_per_deal: number | null
          commission_percentage: number | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_salary?: number | null
          cash_collected_goal?: number | null
          commission_per_deal?: number | null
          commission_percentage?: number | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_salary?: number | null
          cash_collected_goal?: number | null
          commission_per_deal?: number | null
          commission_percentage?: number | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ae_deal_payments: {
        Row: {
          ae_user_id: string
          amount: number
          auto_generated: boolean
          created_at: string
          created_by: string | null
          id: string
          installment_index: number | null
          note: string | null
          paid_on: string
          pitch_call_id: string
          updated_at: string
        }
        Insert: {
          ae_user_id: string
          amount?: number
          auto_generated?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          installment_index?: number | null
          note?: string | null
          paid_on?: string
          pitch_call_id: string
          updated_at?: string
        }
        Update: {
          ae_user_id?: string
          amount?: number
          auto_generated?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          installment_index?: number | null
          note?: string | null
          paid_on?: string
          pitch_call_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ae_deal_payments_pitch_call_id_fkey"
            columns: ["pitch_call_id"]
            isOneToOne: false
            referencedRelation: "pitch_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      ae_metrics_overrides: {
        Row: {
          ae_user_id: string
          cash_collected: number | null
          contract_value: number | null
          created_at: string | null
          created_by: string | null
          id: string
          lead_followups: number | null
          no_shows: number | null
          notes: string | null
          period_end: string
          period_start: string
          qualified_discovery: number | null
          total_closes: number | null
          total_discovery: number | null
          updated_at: string | null
        }
        Insert: {
          ae_user_id: string
          cash_collected?: number | null
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_followups?: number | null
          no_shows?: number | null
          notes?: string | null
          period_end: string
          period_start: string
          qualified_discovery?: number | null
          total_closes?: number | null
          total_discovery?: number | null
          updated_at?: string | null
        }
        Update: {
          ae_user_id?: string
          cash_collected?: number | null
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_followups?: number | null
          no_shows?: number | null
          notes?: string | null
          period_end?: string
          period_start?: string
          qualified_discovery?: number | null
          total_closes?: number | null
          total_discovery?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ae_metrics_overrides_ae_user_id_fkey"
            columns: ["ae_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ae_metrics_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_send_queue: {
        Row: {
          client_email: string
          client_first_name: string
          client_last_name: string
          company_name: string | null
          contract_term: string | null
          contract_value: number | null
          correlation_id: string | null
          created_at: string
          discovery_log_id: string | null
          error_message: string | null
          id: string
          pandadoc_document_id: string | null
          sent_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          client_email: string
          client_first_name: string
          client_last_name: string
          company_name?: string | null
          contract_term?: string | null
          contract_value?: number | null
          correlation_id?: string | null
          created_at?: string
          discovery_log_id?: string | null
          error_message?: string | null
          id?: string
          pandadoc_document_id?: string | null
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          client_email?: string
          client_first_name?: string
          client_last_name?: string
          company_name?: string | null
          contract_term?: string | null
          contract_value?: number | null
          correlation_id?: string | null
          created_at?: string
          discovery_log_id?: string | null
          error_message?: string | null
          id?: string
          pandadoc_document_id?: string | null
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_send_queue_discovery_log_id_fkey"
            columns: ["discovery_log_id"]
            isOneToOne: false
            referencedRelation: "sales_discovery_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      backfill_ae_deals: {
        Row: {
          cash_basis: string | null
          cash_collected: number
          contract_value: number
          created_at: string | null
          deals_closed: number
          id: string
          month: string
          monthly_value: number
          new_cash_collected: number
          pifs: number
          retainers: number
          source: string | null
          source_note: string | null
          total_cash_banked: number
        }
        Insert: {
          cash_basis?: string | null
          cash_collected?: number
          contract_value?: number
          created_at?: string | null
          deals_closed?: number
          id?: string
          month: string
          monthly_value?: number
          new_cash_collected?: number
          pifs?: number
          retainers?: number
          source?: string | null
          source_note?: string | null
          total_cash_banked?: number
        }
        Update: {
          cash_basis?: string | null
          cash_collected?: number
          contract_value?: number
          created_at?: string | null
          deals_closed?: number
          id?: string
          month?: string
          monthly_value?: number
          new_cash_collected?: number
          pifs?: number
          retainers?: number
          source?: string | null
          source_note?: string | null
          total_cash_banked?: number
        }
        Relationships: []
      }
      backfill_clients: {
        Row: {
          campaign_end_date: string | null
          campaign_start_date: string | null
          company_name: string
          created_at: string
          gap_note: string | null
          health_score: number | null
          id: string
          meetings_booked: number | null
          meetings_sat: number | null
          opportunities_terms_sent: number | null
          revenue_generated_potential: number | null
          status: string
          vacancies: number | null
        }
        Insert: {
          campaign_end_date?: string | null
          campaign_start_date?: string | null
          company_name: string
          created_at?: string
          gap_note?: string | null
          health_score?: number | null
          id?: string
          meetings_booked?: number | null
          meetings_sat?: number | null
          opportunities_terms_sent?: number | null
          revenue_generated_potential?: number | null
          status: string
          vacancies?: number | null
        }
        Update: {
          campaign_end_date?: string | null
          campaign_start_date?: string | null
          company_name?: string
          created_at?: string
          gap_note?: string | null
          health_score?: number | null
          id?: string
          meetings_booked?: number | null
          meetings_sat?: number | null
          opportunities_terms_sent?: number | null
          revenue_generated_potential?: number | null
          status?: string
          vacancies?: number | null
        }
        Relationships: []
      }
      backfill_discovery_logs: {
        Row: {
          attendance_confirmed: boolean | null
          contact_name: string | null
          contract_value: number | null
          converted_to_client: boolean | null
          created_at: string
          date_booked: string | null
          former_setter: boolean | null
          id: string
          meeting_at: string
          outcome: string | null
          prospect_company: string | null
          setter_name: string | null
          source_setter: string | null
        }
        Insert: {
          attendance_confirmed?: boolean | null
          contact_name?: string | null
          contract_value?: number | null
          converted_to_client?: boolean | null
          created_at?: string
          date_booked?: string | null
          former_setter?: boolean | null
          id?: string
          meeting_at: string
          outcome?: string | null
          prospect_company?: string | null
          setter_name?: string | null
          source_setter?: string | null
        }
        Update: {
          attendance_confirmed?: boolean | null
          contact_name?: string | null
          contract_value?: number | null
          converted_to_client?: boolean | null
          created_at?: string
          date_booked?: string | null
          former_setter?: boolean | null
          id?: string
          meeting_at?: string
          outcome?: string | null
          prospect_company?: string | null
          setter_name?: string | null
          source_setter?: string | null
        }
        Relationships: []
      }
      backfill_meetings: {
        Row: {
          attendance_confirmed: boolean | null
          attendance_status: string | null
          client_name: string | null
          created_at: string
          department: string | null
          id: string
          is_rebook: boolean | null
          meeting_date: string
          prospect_company: string | null
          setter_name: string | null
          vacancies_value: number | null
          vacancies_won: number | null
        }
        Insert: {
          attendance_confirmed?: boolean | null
          attendance_status?: string | null
          client_name?: string | null
          created_at?: string
          department?: string | null
          id?: string
          is_rebook?: boolean | null
          meeting_date: string
          prospect_company?: string | null
          setter_name?: string | null
          vacancies_value?: number | null
          vacancies_won?: number | null
        }
        Update: {
          attendance_confirmed?: boolean | null
          attendance_status?: string | null
          client_name?: string | null
          created_at?: string
          department?: string | null
          id?: string
          is_rebook?: boolean | null
          meeting_date?: string
          prospect_company?: string | null
          setter_name?: string | null
          vacancies_value?: number | null
          vacancies_won?: number | null
        }
        Relationships: []
      }
      backfill_pitch_calls: {
        Row: {
          agreement: string | null
          attendance_confirmed: boolean | null
          client_email: string | null
          client_name: string | null
          company_name: string | null
          created_at: string
          evidence: string | null
          id: string
          is_rebook: boolean
          pitch_call_date: string
          pitch_outcome: string | null
          source_month: string | null
          status: string | null
        }
        Insert: {
          agreement?: string | null
          attendance_confirmed?: boolean | null
          client_email?: string | null
          client_name?: string | null
          company_name?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          is_rebook?: boolean
          pitch_call_date: string
          pitch_outcome?: string | null
          source_month?: string | null
          status?: string | null
        }
        Update: {
          agreement?: string | null
          attendance_confirmed?: boolean | null
          client_email?: string | null
          client_name?: string | null
          company_name?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          is_rebook?: boolean
          pitch_call_date?: string
          pitch_outcome?: string | null
          source_month?: string | null
          status?: string | null
        }
        Relationships: []
      }
      backfill_sales_discovery_logs: {
        Row: {
          agreement: string | null
          attendance_confirmed: boolean | null
          client_email: string | null
          client_name: string | null
          company_name: string | null
          created_at: string
          evidence: string | null
          id: string
          is_rebook: boolean
          meeting_at: string
          outcome: string | null
          source_month: string | null
          will_self_report: string | null
        }
        Insert: {
          agreement?: string | null
          attendance_confirmed?: boolean | null
          client_email?: string | null
          client_name?: string | null
          company_name?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          is_rebook?: boolean
          meeting_at: string
          outcome?: string | null
          source_month?: string | null
          will_self_report?: string | null
        }
        Update: {
          agreement?: string | null
          attendance_confirmed?: boolean | null
          client_email?: string | null
          client_name?: string | null
          company_name?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          is_rebook?: boolean
          meeting_at?: string
          outcome?: string | null
          source_month?: string | null
          will_self_report?: string | null
        }
        Relationships: []
      }
      backfill_setter_telemetry: {
        Row: {
          connect_rate: number | null
          connects: number | null
          connects_3_plus_mins: number | null
          created_at: string
          date: string
          department: string | null
          dials: number | null
          id: string
          is_partial_coverage: boolean
          setter_email: string | null
          setter_name: string
          source_month: string | null
          talk_time_seconds: number | null
          warm_leads: number | null
        }
        Insert: {
          connect_rate?: number | null
          connects?: number | null
          connects_3_plus_mins?: number | null
          created_at?: string
          date: string
          department?: string | null
          dials?: number | null
          id?: string
          is_partial_coverage?: boolean
          setter_email?: string | null
          setter_name: string
          source_month?: string | null
          talk_time_seconds?: number | null
          warm_leads?: number | null
        }
        Update: {
          connect_rate?: number | null
          connects?: number | null
          connects_3_plus_mins?: number | null
          created_at?: string
          date?: string
          department?: string | null
          dials?: number | null
          id?: string
          is_partial_coverage?: boolean
          setter_email?: string | null
          setter_name?: string
          source_month?: string | null
          talk_time_seconds?: number | null
          warm_leads?: number | null
        }
        Relationships: []
      }
      booking_availability_rules: {
        Row: {
          buffer_minutes: number
          client_profile_id: string | null
          created_at: string
          daily_cap: number | null
          end_time: string
          event_type_id: string | null
          host_user_id: string | null
          id: string
          min_notice_minutes: number
          start_time: string
          timezone: string
          weekday: number
        }
        Insert: {
          buffer_minutes?: number
          client_profile_id?: string | null
          created_at?: string
          daily_cap?: number | null
          end_time: string
          event_type_id?: string | null
          host_user_id?: string | null
          id?: string
          min_notice_minutes?: number
          start_time: string
          timezone?: string
          weekday: number
        }
        Update: {
          buffer_minutes?: number
          client_profile_id?: string | null
          created_at?: string
          daily_cap?: number | null
          end_time?: string
          event_type_id?: string | null
          host_user_id?: string | null
          id?: string
          min_notice_minutes?: number
          start_time?: string
          timezone?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_availability_rules_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_availability_rules_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_event_hosts: {
        Row: {
          client_profile_id: string | null
          created_at: string
          event_type_id: string
          external_email: string | null
          external_name: string | null
          host_calendar_email: string | null
          host_user_id: string | null
          id: string
          priority: number
        }
        Insert: {
          client_profile_id?: string | null
          created_at?: string
          event_type_id: string
          external_email?: string | null
          external_name?: string | null
          host_calendar_email?: string | null
          host_user_id?: string | null
          id?: string
          priority?: number
        }
        Update: {
          client_profile_id?: string | null
          created_at?: string
          event_type_id?: string
          external_email?: string | null
          external_name?: string | null
          host_calendar_email?: string | null
          host_user_id?: string | null
          id?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_event_hosts_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_event_hosts_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_event_types: {
        Row: {
          accepting_bookings: boolean
          booking_horizon_days: number | null
          callback_notice_minutes: number
          client_id: string | null
          created_at: string
          created_by: string | null
          default_source: string | null
          description: string | null
          duration_minutes: number
          event_purpose: string | null
          host_calendar_slots: string | null
          id: string
          invite_only: boolean
          is_active: boolean
          kit_sequence_id: string | null
          location_type: string
          lock_timezone: string | null
          name: string
          offer_phone_choice: boolean
          owner_user_id: string | null
          public_quals_enabled: boolean
          questions: Json
          redirect_url: string | null
          round_robin: boolean
          side: string
          slot_capacity: number | null
          slug: string
          staff_mode: boolean
          static_meeting_link: string | null
          updated_at: string
          warn_personal_email: boolean
          webhook_url: string | null
        }
        Insert: {
          accepting_bookings?: boolean
          booking_horizon_days?: number | null
          callback_notice_minutes?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          default_source?: string | null
          description?: string | null
          duration_minutes?: number
          event_purpose?: string | null
          host_calendar_slots?: string | null
          id?: string
          invite_only?: boolean
          is_active?: boolean
          kit_sequence_id?: string | null
          location_type?: string
          lock_timezone?: string | null
          name: string
          offer_phone_choice?: boolean
          owner_user_id?: string | null
          public_quals_enabled?: boolean
          questions?: Json
          redirect_url?: string | null
          round_robin?: boolean
          side?: string
          slot_capacity?: number | null
          slug: string
          staff_mode?: boolean
          static_meeting_link?: string | null
          updated_at?: string
          warn_personal_email?: boolean
          webhook_url?: string | null
        }
        Update: {
          accepting_bookings?: boolean
          booking_horizon_days?: number | null
          callback_notice_minutes?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          default_source?: string | null
          description?: string | null
          duration_minutes?: number
          event_purpose?: string | null
          host_calendar_slots?: string | null
          id?: string
          invite_only?: boolean
          is_active?: boolean
          kit_sequence_id?: string | null
          location_type?: string
          lock_timezone?: string | null
          name?: string
          offer_phone_choice?: boolean
          owner_user_id?: string | null
          public_quals_enabled?: boolean
          questions?: Json
          redirect_url?: string | null
          round_robin?: boolean
          side?: string
          slot_capacity?: number | null
          slug?: string
          staff_mode?: boolean
          static_meeting_link?: string | null
          updated_at?: string
          warn_personal_email?: boolean
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_event_types_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_event_types_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_follow_up_invites: {
        Row: {
          cancelled_at: string | null
          company_name: string | null
          created_at: string
          created_by: string
          event_type_id: string
          expires_at: string
          host_user_id: string
          id: string
          meeting_id: string
          prospect_email: string | null
          prospect_mobile: string | null
          prospect_name: string | null
          used_at: string | null
          used_booking_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          company_name?: string | null
          created_at?: string
          created_by: string
          event_type_id: string
          expires_at?: string
          host_user_id: string
          id?: string
          meeting_id: string
          prospect_email?: string | null
          prospect_mobile?: string | null
          prospect_name?: string | null
          used_at?: string | null
          used_booking_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string
          event_type_id?: string
          expires_at?: string
          host_user_id?: string
          id?: string
          meeting_id?: string
          prospect_email?: string | null
          prospect_mobile?: string | null
          prospect_name?: string | null
          used_at?: string | null
          used_booking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_follow_up_invites_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_follow_up_invites_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_follow_up_invites_used_booking_id_fkey"
            columns: ["used_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_message_templates: {
        Row: {
          body: string
          channel: string
          enabled: boolean
          event_type_id: string | null
          heading: string | null
          id: string
          key: string
          subject: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          channel: string
          enabled?: boolean
          event_type_id?: string | null
          heading?: string | null
          id?: string
          key: string
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          channel?: string
          enabled?: boolean
          event_type_id?: string | null
          heading?: string | null
          id?: string
          key?: string
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_message_templates_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_notifications: {
        Row: {
          booking_id: string
          channel: string
          created_at: string
          error: string | null
          id: string
          recipient: string
          scheduled_for: string
          sent_at: string | null
          status: string
          template: string
        }
        Insert: {
          booking_id: string
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          recipient: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
          template: string
        }
        Update: {
          booking_id?: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          recipient?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          answers: Json
          callback_backup_times: string[] | null
          cancelled_reason: string | null
          client_profile_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          event_type_id: string
          google_event_id: string | null
          google_meet_link: string | null
          hold_expires_at: string | null
          host_user_id: string | null
          id: string
          location_choice: string | null
          meeting_id: string | null
          prospect_confirmed_at: string | null
          prospect_email: string | null
          prospect_mobile: string | null
          prospect_name: string | null
          prospect_timezone: string | null
          rebooked_from_id: string | null
          rescheduled_at: string | null
          rescheduled_from: string | null
          shared_slot: boolean
          source: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          callback_backup_times?: string[] | null
          cancelled_reason?: string | null
          client_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          event_type_id: string
          google_event_id?: string | null
          google_meet_link?: string | null
          hold_expires_at?: string | null
          host_user_id?: string | null
          id?: string
          location_choice?: string | null
          meeting_id?: string | null
          prospect_confirmed_at?: string | null
          prospect_email?: string | null
          prospect_mobile?: string | null
          prospect_name?: string | null
          prospect_timezone?: string | null
          rebooked_from_id?: string | null
          rescheduled_at?: string | null
          rescheduled_from?: string | null
          shared_slot?: boolean
          source?: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          callback_backup_times?: string[] | null
          cancelled_reason?: string | null
          client_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          event_type_id?: string
          google_event_id?: string | null
          google_meet_link?: string | null
          hold_expires_at?: string | null
          host_user_id?: string | null
          id?: string
          location_choice?: string | null
          meeting_id?: string | null
          prospect_confirmed_at?: string | null
          prospect_email?: string | null
          prospect_mobile?: string | null
          prospect_name?: string | null
          prospect_timezone?: string | null
          rebooked_from_id?: string | null
          rescheduled_at?: string | null
          rescheduled_from?: string | null
          shared_slot?: boolean
          source?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_rebooked_from_id_fkey"
            columns: ["rebooked_from_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          calendar_email: string
          client_profile_id: string | null
          connect_token: string | null
          connected_at: string | null
          created_at: string
          google_access_token: string | null
          google_refresh_token: string | null
          id: string
          invited_at: string | null
          last_checked_at: string | null
          last_error: string | null
          owner_type: string
          provider: string
          status: string
          token_expires_at: string | null
        }
        Insert: {
          calendar_email: string
          client_profile_id?: string | null
          connect_token?: string | null
          connected_at?: string | null
          created_at?: string
          google_access_token?: string | null
          google_refresh_token?: string | null
          id?: string
          invited_at?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          owner_type: string
          provider?: string
          status?: string
          token_expires_at?: string | null
        }
        Update: {
          calendar_email?: string
          client_profile_id?: string | null
          connect_token?: string | null
          connected_at?: string | null
          created_at?: string
          google_access_token?: string | null
          google_refresh_token?: string | null
          id?: string
          invited_at?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          owner_type?: string
          provider?: string
          status?: string
          token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_review_briefs: {
        Row: {
          brief: Json | null
          call_count: number | null
          created_at: string
          date_from: string
          date_to: string
          department: string | null
          error: string | null
          id: string
          manager_user_id: string
          setter_profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          brief?: Json | null
          call_count?: number | null
          created_at?: string
          date_from: string
          date_to: string
          department?: string | null
          error?: string | null
          id?: string
          manager_user_id: string
          setter_profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          brief?: Json | null
          call_count?: number | null
          created_at?: string
          date_from?: string
          date_to?: string
          department?: string | null
          error?: string | null
          id?: string
          manager_user_id?: string
          setter_profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_review_briefs_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_review_briefs_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      call_scores: {
        Row: {
          call_date: string
          call_id: string
          created_at: string
          department: string
          id: string
          mandatory_gates: Json
          mandatory_gates_passed: boolean
          overall_reviewer_notes: string | null
          performance_rating: string
          recording_url: string | null
          sections: Json
          setter_id: string
          setter_name: string
          weighted_total: number
        }
        Insert: {
          call_date: string
          call_id: string
          created_at?: string
          department: string
          id?: string
          mandatory_gates?: Json
          mandatory_gates_passed?: boolean
          overall_reviewer_notes?: string | null
          performance_rating: string
          recording_url?: string | null
          sections?: Json
          setter_id: string
          setter_name: string
          weighted_total: number
        }
        Update: {
          call_date?: string
          call_id?: string
          created_at?: string
          department?: string
          id?: string
          mandatory_gates?: Json
          mandatory_gates_passed?: boolean
          overall_reviewer_notes?: string | null
          performance_rating?: string
          recording_url?: string | null
          sections?: Json
          setter_id?: string
          setter_name?: string
          weighted_total?: number
        }
        Relationships: []
      }
      call_transcripts: {
        Row: {
          call_id: string
          department: string | null
          fetched_at: string
          transcript: Json
        }
        Insert: {
          call_id: string
          department?: string | null
          fetched_at?: string
          transcript: Json
        }
        Update: {
          call_id?: string
          department?: string | null
          fetched_at?: string
          transcript?: Json
        }
        Relationships: []
      }
      campaign_milestones: {
        Row: {
          campaign_id: string | null
          client_profile_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          milestone_date: string
          title: string
          type: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          campaign_id?: string | null
          client_profile_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          milestone_date: string
          title: string
          type: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          campaign_id?: string | null
          client_profile_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          milestone_date?: string
          title?: string
          type?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_milestones_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_milestones_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_weekly_goals: {
        Row: {
          achieved: number
          campaign_id: string
          client_id: string
          created_at: string | null
          goal_met: boolean
          id: string
          published_achieved: number
          target: number
          updated_at: string | null
          week_end: string
          week_number: number
          week_start: string
        }
        Insert: {
          achieved?: number
          campaign_id: string
          client_id: string
          created_at?: string | null
          goal_met?: boolean
          id?: string
          published_achieved?: number
          target?: number
          updated_at?: string | null
          week_end: string
          week_number: number
          week_start: string
        }
        Update: {
          achieved?: number
          campaign_id?: string
          client_id?: string
          created_at?: string | null
          goal_met?: boolean
          id?: string
          published_achieved?: number
          target?: number
          updated_at?: string | null
          week_end?: string
          week_number?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_weekly_goals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          call_duration_seconds: number | null
          call_target: number | null
          calls_outbound: number | null
          campaign_number: number | null
          client_id: string
          created_at: string
          end_date: string | null
          id: string
          launch_date: string | null
          meeting_target: number | null
          meetings_booked: number | null
          meetings_sat: number | null
          name: string
          notes: string | null
          progress_manual_pct: number | null
          renewal_notified_14d: boolean
          renewal_notified_30d: boolean
          renewal_notified_7d: boolean
          start_date: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          call_duration_seconds?: number | null
          call_target?: number | null
          calls_outbound?: number | null
          campaign_number?: number | null
          client_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          launch_date?: string | null
          meeting_target?: number | null
          meetings_booked?: number | null
          meetings_sat?: number | null
          name: string
          notes?: string | null
          progress_manual_pct?: number | null
          renewal_notified_14d?: boolean
          renewal_notified_30d?: boolean
          renewal_notified_7d?: boolean
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          call_duration_seconds?: number | null
          call_target?: number | null
          calls_outbound?: number | null
          campaign_number?: number | null
          client_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          launch_date?: string | null
          meeting_target?: number | null
          meetings_booked?: number | null
          meetings_sat?: number | null
          name?: string
          notes?: string | null
          progress_manual_pct?: number | null
          renewal_notified_14d?: boolean
          renewal_notified_30d?: boolean
          renewal_notified_7d?: boolean
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_assessments: {
        Row: {
          assessment_payload: Json | null
          assessment_pretty_text: string | null
          created_at: string | null
          email: string | null
          external_submission_id: string
          full_name: string | null
          id: string
          phone: string | null
          role_applied: string | null
          source: string | null
          status:
            | Database["public"]["Enums"]["candidate_assessment_status"]
            | null
          submitted_at_raw: string | null
          updated_at: string | null
        }
        Insert: {
          assessment_payload?: Json | null
          assessment_pretty_text?: string | null
          created_at?: string | null
          email?: string | null
          external_submission_id: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role_applied?: string | null
          source?: string | null
          status?:
            | Database["public"]["Enums"]["candidate_assessment_status"]
            | null
          submitted_at_raw?: string | null
          updated_at?: string | null
        }
        Update: {
          assessment_payload?: Json | null
          assessment_pretty_text?: string | null
          created_at?: string | null
          email?: string | null
          external_submission_id?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role_applied?: string | null
          source?: string | null
          status?:
            | Database["public"]["Enums"]["candidate_assessment_status"]
            | null
          submitted_at_raw?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      candidate_final_interviews: {
        Row: {
          answers: Json
          candidate_id: string
          created_at: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          candidate_id: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          candidate_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_final_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_phone_screens: {
        Row: {
          accent_pass: boolean | null
          age: number | null
          avg_appointments_per_month: number | null
          avg_appointments_per_month_raw: string | null
          avg_dials_per_day: number | null
          avg_dials_per_day_raw: string | null
          b2b_cold_calling_last_6mo: boolean | null
          childcare_support: boolean | null
          cold_mix_band: string | null
          countries_sold_into: string | null
          created_at: string
          current_job_title: string | null
          cv_screening_id: string
          has_children: boolean | null
          has_equipment: boolean | null
          health_adjustments: boolean | null
          id: string
          notice_period: string | null
          pct_cold_leads: number | null
          pct_warm_leads: number | null
          uk_sold_what: string | null
          updated_at: string
          what_they_sell: string | null
          years_b2b_cold_calling: number | null
        }
        Insert: {
          accent_pass?: boolean | null
          age?: number | null
          avg_appointments_per_month?: number | null
          avg_appointments_per_month_raw?: string | null
          avg_dials_per_day?: number | null
          avg_dials_per_day_raw?: string | null
          b2b_cold_calling_last_6mo?: boolean | null
          childcare_support?: boolean | null
          cold_mix_band?: string | null
          countries_sold_into?: string | null
          created_at?: string
          current_job_title?: string | null
          cv_screening_id: string
          has_children?: boolean | null
          has_equipment?: boolean | null
          health_adjustments?: boolean | null
          id?: string
          notice_period?: string | null
          pct_cold_leads?: number | null
          pct_warm_leads?: number | null
          uk_sold_what?: string | null
          updated_at?: string
          what_they_sell?: string | null
          years_b2b_cold_calling?: number | null
        }
        Update: {
          accent_pass?: boolean | null
          age?: number | null
          avg_appointments_per_month?: number | null
          avg_appointments_per_month_raw?: string | null
          avg_dials_per_day?: number | null
          avg_dials_per_day_raw?: string | null
          b2b_cold_calling_last_6mo?: boolean | null
          childcare_support?: boolean | null
          cold_mix_band?: string | null
          countries_sold_into?: string | null
          created_at?: string
          current_job_title?: string | null
          cv_screening_id?: string
          has_children?: boolean | null
          has_equipment?: boolean | null
          health_adjustments?: boolean | null
          id?: string
          notice_period?: string | null
          pct_cold_leads?: number | null
          pct_warm_leads?: number | null
          uk_sold_what?: string | null
          updated_at?: string
          what_they_sell?: string | null
          years_b2b_cold_calling?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_phone_screens_cv_screening_id_fkey"
            columns: ["cv_screening_id"]
            isOneToOne: true
            referencedRelation: "cv_screenings"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_stage_events: {
        Row: {
          candidate_id: string
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          id: string
          note: string | null
          to_stage: string
        }
        Insert: {
          candidate_id: string
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          note?: string | null
          to_stage: string
        }
        Update: {
          candidate_id?: string
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          note?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_stage_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          accepted_date: string | null
          avg_monthly_appointments_last_role: number | null
          call_recording_url: string | null
          call_time: string | null
          ceo_trial_call_date: string | null
          close_lead_url: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          cv_file: string | null
          cv_screening_id: string | null
          date_added: string | null
          date_of_call: string
          email: string
          exit_reason: string | null
          feedback_from_ops_lead: string | null
          feedback_from_ceo: string | null
          final_interview_time: string | null
          first_name: string
          id: string
          last_name: string
          last_position: string | null
          last_product_sold: string | null
          lct_attendance: string | null
          lct_booked_date: string | null
          lct_booked_time: string | null
          linkedin_url: string | null
          mobile_phone: string | null
          notes: string | null
          offer_handoff_at: string | null
          offer_letter_date: string | null
          offer_start_date: string | null
          offer_wage: number | null
          pipeline_stage: number | null
          sdr_interview_date: string | null
          source: string | null
          stage_changed_at: string | null
          stage_key: string | null
          status: string | null
          trial_client_ids: string[]
          trial_day_date: string | null
          trialist_user_id: string | null
          updated_at: string | null
          years_appointment_setting: number | null
          years_cold_calling_uk: number | null
        }
        Insert: {
          accepted_date?: string | null
          avg_monthly_appointments_last_role?: number | null
          call_recording_url?: string | null
          call_time?: string | null
          ceo_trial_call_date?: string | null
          close_lead_url?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          cv_file?: string | null
          cv_screening_id?: string | null
          date_added?: string | null
          date_of_call: string
          email: string
          exit_reason?: string | null
          feedback_from_ops_lead?: string | null
          feedback_from_ceo?: string | null
          final_interview_time?: string | null
          first_name: string
          id?: string
          last_name: string
          last_position?: string | null
          last_product_sold?: string | null
          lct_attendance?: string | null
          lct_booked_date?: string | null
          lct_booked_time?: string | null
          linkedin_url?: string | null
          mobile_phone?: string | null
          notes?: string | null
          offer_handoff_at?: string | null
          offer_letter_date?: string | null
          offer_start_date?: string | null
          offer_wage?: number | null
          pipeline_stage?: number | null
          sdr_interview_date?: string | null
          source?: string | null
          stage_changed_at?: string | null
          stage_key?: string | null
          status?: string | null
          trial_client_ids?: string[]
          trial_day_date?: string | null
          trialist_user_id?: string | null
          updated_at?: string | null
          years_appointment_setting?: number | null
          years_cold_calling_uk?: number | null
        }
        Update: {
          accepted_date?: string | null
          avg_monthly_appointments_last_role?: number | null
          call_recording_url?: string | null
          call_time?: string | null
          ceo_trial_call_date?: string | null
          close_lead_url?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          cv_file?: string | null
          cv_screening_id?: string | null
          date_added?: string | null
          date_of_call?: string
          email?: string
          exit_reason?: string | null
          feedback_from_ops_lead?: string | null
          feedback_from_ceo?: string | null
          final_interview_time?: string | null
          first_name?: string
          id?: string
          last_name?: string
          last_position?: string | null
          last_product_sold?: string | null
          lct_attendance?: string | null
          lct_booked_date?: string | null
          lct_booked_time?: string | null
          linkedin_url?: string | null
          mobile_phone?: string | null
          notes?: string | null
          offer_handoff_at?: string | null
          offer_letter_date?: string | null
          offer_start_date?: string | null
          offer_wage?: number | null
          pipeline_stage?: number | null
          sdr_interview_date?: string | null
          source?: string | null
          stage_changed_at?: string | null
          stage_key?: string | null
          status?: string | null
          trial_client_ids?: string[]
          trial_day_date?: string | null
          trialist_user_id?: string | null
          updated_at?: string | null
          years_appointment_setting?: number | null
          years_cold_calling_uk?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_cv_screening_id_fkey"
            columns: ["cv_screening_id"]
            isOneToOne: false
            referencedRelation: "cv_screenings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_trialist_user_id_fkey"
            columns: ["trialist_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ceo_growth_inputs: {
        Row: {
          cac_amount: number | null
          cost_to_fulfil: number | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          marketing_spend: number | null
          month: string
          new_clients: number | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          cac_amount?: number | null
          cost_to_fulfil?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          marketing_spend?: number | null
          month: string
          new_clients?: number | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          cac_amount?: number | null
          cost_to_fulfil?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          marketing_spend?: number | null
          month?: string
          new_clients?: number | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ceo_initiatives: {
        Row: {
          created_at: string
          deadline: string | null
          department: string
          description: string | null
          id: string
          owner_name: string
          owner_user_id: string | null
          position: number
          progress_pct: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          department?: string
          description?: string | null
          id?: string
          owner_name: string
          owner_user_id?: string | null
          position?: number
          progress_pct?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deadline?: string | null
          department?: string
          description?: string | null
          id?: string
          owner_name?: string
          owner_user_id?: string | null
          position?: number
          progress_pct?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_catchups: {
        Row: {
          action_points: string[] | null
          client_profile_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          csm_happy: boolean | null
          csm_happy_note: string | null
          fathom_link: string | null
          id: string
          notification_1d_sent: boolean | null
          notification_1h_sent: boolean | null
          notification_2d_sent: boolean | null
          notification_day_sent: boolean | null
          opportunities: number | null
          potential_revenue_total: number | null
          scheduled_date: string
          scheduled_time: string
          status: string
          summary: string | null
          testimonial_agreed: boolean
          updated_at: string
          vacancies_open: number | null
        }
        Insert: {
          action_points?: string[] | null
          client_profile_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          csm_happy?: boolean | null
          csm_happy_note?: string | null
          fathom_link?: string | null
          id?: string
          notification_1d_sent?: boolean | null
          notification_1h_sent?: boolean | null
          notification_2d_sent?: boolean | null
          notification_day_sent?: boolean | null
          opportunities?: number | null
          potential_revenue_total?: number | null
          scheduled_date: string
          scheduled_time?: string
          status?: string
          summary?: string | null
          testimonial_agreed?: boolean
          updated_at?: string
          vacancies_open?: number | null
        }
        Update: {
          action_points?: string[] | null
          client_profile_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          csm_happy?: boolean | null
          csm_happy_note?: string | null
          fathom_link?: string | null
          id?: string
          notification_1d_sent?: boolean | null
          notification_1h_sent?: boolean | null
          notification_2d_sent?: boolean | null
          notification_day_sent?: boolean | null
          opportunities?: number | null
          potential_revenue_total?: number | null
          scheduled_date?: string
          scheduled_time?: string
          status?: string
          summary?: string | null
          testimonial_agreed?: boolean
          updated_at?: string
          vacancies_open?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_catchups_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_flow_settings: {
        Row: {
          finish_thumbnail_path: string | null
          finish_video_path: string | null
          finish_video_url: string | null
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          finish_thumbnail_path?: string | null
          finish_video_path?: string | null
          finish_video_url?: string | null
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          finish_thumbnail_path?: string | null
          finish_video_path?: string | null
          finish_video_url?: string | null
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      client_flow_stages: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          sort_order: number
          stage_key: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          sort_order?: number
          stage_key: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          sort_order?: number
          stage_key?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_flow_steps: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          document_path: string | null
          enabled: boolean
          id: string
          label: string
          link_url: string | null
          sort_order: number
          stage_id: string
          step_key: string
          step_type: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          document_path?: string | null
          enabled?: boolean
          id?: string
          label: string
          link_url?: string | null
          sort_order?: number
          stage_id: string
          step_key: string
          step_type?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          document_path?: string | null
          enabled?: boolean
          id?: string
          label?: string
          link_url?: string | null
          sort_order?: number
          stage_id?: string
          step_key?: string
          step_type?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_flow_steps_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "client_flow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_health_metric_override_history: {
        Row: {
          action: string
          affects_health: boolean | null
          client_profile_id: string
          id: string
          metric: string
          performed_at: string
          performed_by: string | null
          value: number | null
        }
        Insert: {
          action: string
          affects_health?: boolean | null
          client_profile_id: string
          id?: string
          metric: string
          performed_at?: string
          performed_by?: string | null
          value?: number | null
        }
        Update: {
          action?: string
          affects_health?: boolean | null
          client_profile_id?: string
          id?: string
          metric?: string
          performed_at?: string
          performed_by?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_health_metric_override_history_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_health_metric_overrides: {
        Row: {
          affects_health: boolean
          client_profile_id: string
          created_at: string
          id: string
          metric: string
          set_at: string
          set_by: string
          value: number
        }
        Insert: {
          affects_health?: boolean
          client_profile_id: string
          created_at?: string
          id?: string
          metric: string
          set_at?: string
          set_by: string
          value: number
        }
        Update: {
          affects_health?: boolean
          client_profile_id?: string
          created_at?: string
          id?: string
          metric?: string
          set_at?: string
          set_by?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_health_metric_overrides_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_health_opening_balances: {
        Row: {
          client_profile_id: string
          id: string
          imported_at: string
          imported_by: string | null
          opening_booked: number | null
          opening_sat: number | null
          opportunities: number | null
          potential_revenue: number | null
          source: string
          vacancies: number | null
        }
        Insert: {
          client_profile_id: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          opening_booked?: number | null
          opening_sat?: number | null
          opportunities?: number | null
          potential_revenue?: number | null
          source?: string
          vacancies?: number | null
        }
        Update: {
          client_profile_id?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          opening_booked?: number | null
          opening_sat?: number | null
          opportunities?: number | null
          potential_revenue?: number | null
          source?: string
          vacancies?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_health_opening_balances_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: true
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_icp_profiles: {
        Row: {
          additional_criteria: string | null
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          client_notes: string | null
          client_profile_id: string
          created_at: string
          exclusions: string | null
          hiring_frequency: string | null
          id: string
          max_company_size: number | null
          min_company_size: number | null
          status: string
          submitted_at: string | null
          target_company_sizes: string[] | null
          target_industries: string[] | null
          target_job_titles: string[] | null
          target_locations: string[] | null
          updated_at: string
        }
        Insert: {
          additional_criteria?: string | null
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_notes?: string | null
          client_profile_id: string
          created_at?: string
          exclusions?: string | null
          hiring_frequency?: string | null
          id?: string
          max_company_size?: number | null
          min_company_size?: number | null
          status?: string
          submitted_at?: string | null
          target_company_sizes?: string[] | null
          target_industries?: string[] | null
          target_job_titles?: string[] | null
          target_locations?: string[] | null
          updated_at?: string
        }
        Update: {
          additional_criteria?: string | null
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_notes?: string | null
          client_profile_id?: string
          created_at?: string
          exclusions?: string | null
          hiring_frequency?: string | null
          id?: string
          max_company_size?: number | null
          min_company_size?: number | null
          status?: string
          submitted_at?: string | null
          target_company_sizes?: string[] | null
          target_industries?: string[] | null
          target_job_titles?: string[] | null
          target_locations?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_icp_profiles_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: true
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_journey_stage_unlocks: {
        Row: {
          created_at: string
          id: string
          journey_id: string
          note: string | null
          stage_key: string
          unlocked_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          journey_id: string
          note?: string | null
          stage_key: string
          unlocked_by: string
        }
        Update: {
          created_at?: string
          id?: string
          journey_id?: string
          note?: string | null
          stage_key?: string
          unlocked_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_journey_stage_unlocks_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "client_onboarding_journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      client_journey_tasks: {
        Row: {
          answers: Json | null
          booking_id: string | null
          completed_at: string | null
          completed_by: string | null
          config: Json
          created_at: string
          description: string | null
          document_path: string | null
          file_path: string | null
          id: string
          is_completed: boolean
          journey_id: string
          label: string
          link_url: string | null
          sort_order: number
          stage_key: string
          stage_order: number
          stage_subtitle: string | null
          stage_title: string
          step_key: string
          step_type: string
          updated_at: string
          video_url: string | null
          waive_note: string | null
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          answers?: Json | null
          booking_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          document_path?: string | null
          file_path?: string | null
          id?: string
          is_completed?: boolean
          journey_id: string
          label: string
          link_url?: string | null
          sort_order?: number
          stage_key: string
          stage_order: number
          stage_subtitle?: string | null
          stage_title: string
          step_key: string
          step_type: string
          updated_at?: string
          video_url?: string | null
          waive_note?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          answers?: Json | null
          booking_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          document_path?: string | null
          file_path?: string | null
          id?: string
          is_completed?: boolean
          journey_id?: string
          label?: string
          link_url?: string | null
          sort_order?: number
          stage_key?: string
          stage_order?: number
          stage_subtitle?: string | null
          stage_title?: string
          step_key?: string
          step_type?: string
          updated_at?: string
          video_url?: string | null
          waive_note?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_journey_tasks_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "client_onboarding_journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      client_lead_lists: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          client_notes: string | null
          client_profile_id: string
          created_at: string
          created_by: string | null
          file_name: string | null
          file_url: string | null
          id: string
          is_default: boolean
          list_type: string | null
          name: string
          source: string | null
          status: string
          submitted_at: string | null
          total_contacts: number | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_notes?: string | null
          client_profile_id: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_default?: boolean
          list_type?: string | null
          name: string
          source?: string | null
          status?: string
          submitted_at?: string | null
          total_contacts?: number | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_notes?: string | null
          client_profile_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_default?: boolean
          list_type?: string | null
          name?: string
          source?: string | null
          status?: string
          submitted_at?: string | null
          total_contacts?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_lead_lists_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_metric_entries: {
        Row: {
          client_profile_id: string
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          metric_type: string
          notes: string | null
          value: number
        }
        Insert: {
          client_profile_id: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          metric_type: string
          notes?: string | null
          value?: number
        }
        Update: {
          client_profile_id?: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          metric_type?: string
          notes?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_metric_entries_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_name_aliases: {
        Row: {
          client_profile_id: string
          created_at: string
          created_by: string | null
          id: string
          sheet_name: string
        }
        Insert: {
          client_profile_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          sheet_name: string
        }
        Update: {
          client_profile_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          sheet_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_name_aliases_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_offboarding_stages: {
        Row: {
          assigned_csm_id: string | null
          client_profile_id: string
          completed_at: string | null
          created_at: string
          current_stage: number
          id: string
          notes: string | null
          reason: string | null
          removed_at: string | null
          started_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_csm_id?: string | null
          client_profile_id: string
          completed_at?: string | null
          created_at?: string
          current_stage?: number
          id?: string
          notes?: string | null
          reason?: string | null
          removed_at?: string | null
          started_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_csm_id?: string | null
          client_profile_id?: string
          completed_at?: string | null
          created_at?: string
          current_stage?: number
          id?: string
          notes?: string | null
          reason?: string | null
          removed_at?: string | null
          started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_offboarding_stages_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_offboarding_tasks: {
        Row: {
          client_offboarding_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          is_completed: boolean | null
          stage: number
          task_key: string
          task_label: string
        }
        Insert: {
          client_offboarding_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          stage: number
          task_key: string
          task_label: string
        }
        Update: {
          client_offboarding_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          stage?: number
          task_key?: string
          task_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_offboarding_tasks_client_offboarding_id_fkey"
            columns: ["client_offboarding_id"]
            isOneToOne: false
            referencedRelation: "client_offboarding_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding_journeys: {
        Row: {
          campaign_id: string | null
          campaign_live_at: string | null
          campaign_live_by: string | null
          client_profile_id: string
          completed_at: string | null
          contract_signed_at: string | null
          created_at: string
          first_signed_in_at: string | null
          id: string
          is_test: boolean
          pandadoc_document_id: string | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          released_at: string | null
          released_by: string | null
          source: string
          status: string
          updated_at: string
          welcome_email_sent_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          campaign_live_at?: string | null
          campaign_live_by?: string | null
          client_profile_id: string
          completed_at?: string | null
          contract_signed_at?: string | null
          created_at?: string
          first_signed_in_at?: string | null
          id?: string
          is_test?: boolean
          pandadoc_document_id?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          released_at?: string | null
          released_by?: string | null
          source?: string
          status?: string
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          campaign_live_at?: string | null
          campaign_live_by?: string | null
          client_profile_id?: string
          completed_at?: string | null
          contract_signed_at?: string | null
          created_at?: string
          first_signed_in_at?: string | null
          id?: string
          is_test?: boolean
          pandadoc_document_id?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          released_at?: string | null
          released_by?: string | null
          source?: string
          status?: string
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_journeys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_onboarding_journeys_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: true
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding_stages: {
        Row: {
          assigned_csm_id: string | null
          client_profile_id: string
          company_name_raw: string | null
          completed_at: string | null
          created_at: string | null
          created_by_email: string | null
          current_stage: number | null
          drive_folder_url: string | null
          grand_total_amount: number | null
          grand_total_currency: string | null
          id: string
          pandadoc_created_at: string | null
          pandadoc_paid_at: string | null
          pandadoc_shared_link: string | null
          pandadoc_status: string | null
          removed_at: string | null
          signer_email: string | null
          signer_name: string | null
          source: string | null
          source_event: string | null
          source_key: string | null
          started_at: string | null
          updated_at: string | null
          webhook_payload_raw: Json | null
        }
        Insert: {
          assigned_csm_id?: string | null
          client_profile_id: string
          company_name_raw?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by_email?: string | null
          current_stage?: number | null
          drive_folder_url?: string | null
          grand_total_amount?: number | null
          grand_total_currency?: string | null
          id?: string
          pandadoc_created_at?: string | null
          pandadoc_paid_at?: string | null
          pandadoc_shared_link?: string | null
          pandadoc_status?: string | null
          removed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          source?: string | null
          source_event?: string | null
          source_key?: string | null
          started_at?: string | null
          updated_at?: string | null
          webhook_payload_raw?: Json | null
        }
        Update: {
          assigned_csm_id?: string | null
          client_profile_id?: string
          company_name_raw?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by_email?: string | null
          current_stage?: number | null
          drive_folder_url?: string | null
          grand_total_amount?: number | null
          grand_total_currency?: string | null
          id?: string
          pandadoc_created_at?: string | null
          pandadoc_paid_at?: string | null
          pandadoc_shared_link?: string | null
          pandadoc_status?: string | null
          removed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          source?: string | null
          source_event?: string | null
          source_key?: string | null
          started_at?: string | null
          updated_at?: string | null
          webhook_payload_raw?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_stages_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: true
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding_tasks: {
        Row: {
          client_onboarding_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          id: string
          is_completed: boolean | null
          stage: number
          task_key: string
          task_label: string
        }
        Insert: {
          client_onboarding_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          stage: number
          task_key: string
          task_label: string
        }
        Update: {
          client_onboarding_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          stage?: number
          task_key?: string
          task_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_tasks_client_onboarding_id_fkey"
            columns: ["client_onboarding_id"]
            isOneToOne: false
            referencedRelation: "client_onboarding_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payments: {
        Row: {
          ae_user_id: string | null
          amount: number | null
          client_id: string | null
          client_profile_id: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_url: string | null
          next_payment_date: string | null
          notes: string | null
          payment_date: string | null
          pitch_call_id: string | null
          proof_of_payment_url: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          ae_user_id?: string | null
          amount?: number | null
          client_id?: string | null
          client_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_url?: string | null
          next_payment_date?: string | null
          notes?: string | null
          payment_date?: string | null
          pitch_call_id?: string | null
          proof_of_payment_url?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          ae_user_id?: string | null
          amount?: number | null
          client_id?: string | null
          client_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_url?: string | null
          next_payment_date?: string | null
          notes?: string | null
          payment_date?: string | null
          pitch_call_id?: string | null
          proof_of_payment_url?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_profile_users: {
        Row: {
          client_profile_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          client_profile_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          client_profile_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_profile_users_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_profiles: {
        Row: {
          billing_address: string | null
          calendly_link: string | null
          campaign_end_date: string | null
          campaign_start_date: string | null
          company_name: string
          contact_name: string | null
          contract_term: string | null
          contract_value: number | null
          country: string | null
          created_at: string
          credentials_encrypted: string | null
          csm_happy: boolean | null
          csm_happy_assessed_at: string | null
          csm_happy_note: string | null
          csm_notes_to_client: string | null
          email: string | null
          health_override: string | null
          health_score: number | null
          id: string
          industry: string | null
          is_test_account: boolean
          kpi_last_updated: string | null
          kpi_meeting_requirements: number | null
          kpi_meetings_approved: number | null
          kpi_meetings_booked: number | null
          kpi_meetings_rejected: number | null
          kpi_meetings_sat: number | null
          kpi_opportunities: number | null
          logo: string | null
          phone: string | null
          potential_placement_fee_value: number | null
          renewal_date: string | null
          show_weekly_goals: boolean
          size: string | null
          status: Database["public"]["Enums"]["client_profile_status"] | null
          team_network_member: boolean | null
          terms_sent: number | null
          terms_signed_date: string | null
          trial_alias: string | null
          updated_at: string
          user_id: string | null
          vacancies_taken_on: number | null
          website: string | null
        }
        Insert: {
          billing_address?: string | null
          calendly_link?: string | null
          campaign_end_date?: string | null
          campaign_start_date?: string | null
          company_name: string
          contact_name?: string | null
          contract_term?: string | null
          contract_value?: number | null
          country?: string | null
          created_at?: string
          credentials_encrypted?: string | null
          csm_happy?: boolean | null
          csm_happy_assessed_at?: string | null
          csm_happy_note?: string | null
          csm_notes_to_client?: string | null
          email?: string | null
          health_override?: string | null
          health_score?: number | null
          id?: string
          industry?: string | null
          is_test_account?: boolean
          kpi_last_updated?: string | null
          kpi_meeting_requirements?: number | null
          kpi_meetings_approved?: number | null
          kpi_meetings_booked?: number | null
          kpi_meetings_rejected?: number | null
          kpi_meetings_sat?: number | null
          kpi_opportunities?: number | null
          logo?: string | null
          phone?: string | null
          potential_placement_fee_value?: number | null
          renewal_date?: string | null
          show_weekly_goals?: boolean
          size?: string | null
          status?: Database["public"]["Enums"]["client_profile_status"] | null
          team_network_member?: boolean | null
          terms_sent?: number | null
          terms_signed_date?: string | null
          trial_alias?: string | null
          updated_at?: string
          user_id?: string | null
          vacancies_taken_on?: number | null
          website?: string | null
        }
        Update: {
          billing_address?: string | null
          calendly_link?: string | null
          campaign_end_date?: string | null
          campaign_start_date?: string | null
          company_name?: string
          contact_name?: string | null
          contract_term?: string | null
          contract_value?: number | null
          country?: string | null
          created_at?: string
          credentials_encrypted?: string | null
          csm_happy?: boolean | null
          csm_happy_assessed_at?: string | null
          csm_happy_note?: string | null
          csm_notes_to_client?: string | null
          email?: string | null
          health_override?: string | null
          health_score?: number | null
          id?: string
          industry?: string | null
          is_test_account?: boolean
          kpi_last_updated?: string | null
          kpi_meeting_requirements?: number | null
          kpi_meetings_approved?: number | null
          kpi_meetings_booked?: number | null
          kpi_meetings_rejected?: number | null
          kpi_meetings_sat?: number | null
          kpi_opportunities?: number | null
          logo?: string | null
          phone?: string | null
          potential_placement_fee_value?: number | null
          renewal_date?: string | null
          show_weekly_goals?: boolean
          size?: string | null
          status?: Database["public"]["Enums"]["client_profile_status"] | null
          team_network_member?: boolean | null
          terms_sent?: number | null
          terms_signed_date?: string | null
          trial_alias?: string | null
          updated_at?: string
          user_id?: string | null
          vacancies_taken_on?: number | null
          website?: string | null
        }
        Relationships: []
      }
      client_receipts: {
        Row: {
          client_profile_id: string
          created_at: string
          description: string | null
          document_category: string
          file_name: string
          file_path: string
          id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          client_profile_id: string
          created_at?: string
          description?: string | null
          document_category?: string
          file_name: string
          file_path: string
          id?: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          client_profile_id?: string
          created_at?: string
          description?: string | null
          document_category?: string
          file_name?: string
          file_path?: string
          id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_receipts_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_renewals: {
        Row: {
          amount: number | null
          client_profile_id: string
          created_at: string
          effective_date: string
          id: string
          kind: string
          new_contract_term: string | null
          notes: string | null
          recorded_by: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          client_profile_id: string
          created_at?: string
          effective_date?: string
          id?: string
          kind: string
          new_contract_term?: string | null
          notes?: string | null
          recorded_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          client_profile_id?: string
          created_at?: string
          effective_date?: string
          id?: string
          kind?: string
          new_contract_term?: string | null
          notes?: string | null
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_renewals_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_source_materials: {
        Row: {
          category: string | null
          client_profile_id: string
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          client_profile_id: string
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          client_profile_id?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_source_materials_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_stipulations: {
        Row: {
          client_id: string
          created_at: string | null
          date: string
          id: string
          issue: string
          resolved: boolean | null
          resolved_at: string | null
          severity: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          date?: string
          id?: string
          issue: string
          resolved?: boolean | null
          resolved_at?: string | null
          severity: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          date?: string
          id?: string
          issue?: string
          resolved?: boolean | null
          resolved_at?: string | null
          severity?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_stipulations_client_profile_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          admin_notes: string | null
          auth_user_id: string | null
          company_name: string
          company_size: string | null
          company_website: string | null
          contact_name: string
          country: string | null
          created_at: string
          email: string
          health_status: string | null
          id: string
          industry: string | null
          logo: string | null
          mobile: string | null
          onboarded: boolean | null
          team_network_member: boolean | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          auth_user_id?: string | null
          company_name: string
          company_size?: string | null
          company_website?: string | null
          contact_name: string
          country?: string | null
          created_at?: string
          email: string
          health_status?: string | null
          id?: string
          industry?: string | null
          logo?: string | null
          mobile?: string | null
          onboarded?: boolean | null
          team_network_member?: boolean | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          auth_user_id?: string | null
          company_name?: string
          company_size?: string | null
          company_website?: string | null
          contact_name?: string
          country?: string | null
          created_at?: string
          email?: string
          health_status?: string | null
          id?: string
          industry?: string | null
          logo?: string | null
          mobile?: string | null
          onboarded?: boolean | null
          team_network_member?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      close_events_dedup: {
        Row: {
          created_at: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      coaching_action_items: {
        Row: {
          carried_to_session_id: string | null
          coaching_session_id: string
          completed_at: string | null
          created_at: string
          description: string
          due_date: string | null
          id: string
          manager_user_id: string
          setter_profile_id: string
          source: string | null
          source_brief_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          carried_to_session_id?: string | null
          coaching_session_id: string
          completed_at?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          manager_user_id: string
          setter_profile_id: string
          source?: string | null
          source_brief_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          carried_to_session_id?: string | null
          coaching_session_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          manager_user_id?: string
          setter_profile_id?: string
          source?: string | null
          source_brief_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_action_items_carried_to_session_id_fkey"
            columns: ["carried_to_session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_action_items_coaching_session_id_fkey"
            columns: ["coaching_session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_action_items_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_action_items_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_sessions: {
        Row: {
          action_items: string[] | null
          agenda: string | null
          booking_id: string | null
          call_recording_link: string | null
          created_at: string
          custom_session_label: string | null
          duration_minutes: number
          fathom_link: string | null
          id: string
          improvements: string | null
          manager_user_id: string
          notes: string | null
          observations: string | null
          overall_rating: number | null
          priority_1: string | null
          priority_2: string | null
          recurring_group_id: string | null
          roleplay_notes: string | null
          scorecard: Json | null
          session_date: string
          session_time: string | null
          session_type: string
          setter_profile_id: string
          setter_self_reflection: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_items?: string[] | null
          agenda?: string | null
          booking_id?: string | null
          call_recording_link?: string | null
          created_at?: string
          custom_session_label?: string | null
          duration_minutes?: number
          fathom_link?: string | null
          id?: string
          improvements?: string | null
          manager_user_id: string
          notes?: string | null
          observations?: string | null
          overall_rating?: number | null
          priority_1?: string | null
          priority_2?: string | null
          recurring_group_id?: string | null
          roleplay_notes?: string | null
          scorecard?: Json | null
          session_date?: string
          session_time?: string | null
          session_type: string
          setter_profile_id: string
          setter_self_reflection?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_items?: string[] | null
          agenda?: string | null
          booking_id?: string | null
          call_recording_link?: string | null
          created_at?: string
          custom_session_label?: string | null
          duration_minutes?: number
          fathom_link?: string | null
          id?: string
          improvements?: string | null
          manager_user_id?: string
          notes?: string | null
          observations?: string | null
          overall_rating?: number | null
          priority_1?: string | null
          priority_2?: string | null
          recurring_group_id?: string | null
          roleplay_notes?: string | null
          scorecard?: Json | null
          session_date?: string
          session_time?: string | null
          session_type?: string
          setter_profile_id?: string
          setter_self_reflection?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_screenings: {
        Row: {
          agent_candidate_id: string | null
          b2b_or_b2c: string | null
          bucket: string
          candidate_id: string | null
          close_lead_id: string | null
          close_lead_url: string | null
          cons: string[]
          created_at: string
          current_company: string | null
          current_title: string | null
          currently_employed: boolean | null
          daily_output: string | null
          date_issues: string[]
          email: string | null
          evidence: string[]
          first_name: string | null
          flags: string[]
          full_name: string
          gaps_to_probe: string[]
          gate_recency: string | null
          gate_tenure: string | null
          id: string
          identity_check: string | null
          ingested_via: string
          is_archived: boolean
          languages_raw: string | null
          last_name: string | null
          last_screened_at: string | null
          linkedin_url: string | null
          location: string | null
          market_exposure: Json | null
          matric_year_raw: string | null
          months_since_last_qualifying: number | null
          notice_period_raw: string | null
          ops_notes: string | null
          phone: string | null
          pros: string[]
          qualifying_months: number | null
          reasoning: string | null
          reject_reason: string | null
          review_status: string | null
          run_id: string | null
          salary_expectation_raw: string | null
          score: number | null
          screened_on: string
          signals: Json | null
          skill_version: string | null
          source: string | null
          source_file: string
          source_file_slug: string
          typeform_answers: Json | null
          updated_at: string
        }
        Insert: {
          agent_candidate_id?: string | null
          b2b_or_b2c?: string | null
          bucket: string
          candidate_id?: string | null
          close_lead_id?: string | null
          close_lead_url?: string | null
          cons?: string[]
          created_at?: string
          current_company?: string | null
          current_title?: string | null
          currently_employed?: boolean | null
          daily_output?: string | null
          date_issues?: string[]
          email?: string | null
          evidence?: string[]
          first_name?: string | null
          flags?: string[]
          full_name: string
          gaps_to_probe?: string[]
          gate_recency?: string | null
          gate_tenure?: string | null
          id?: string
          identity_check?: string | null
          ingested_via?: string
          is_archived?: boolean
          languages_raw?: string | null
          last_name?: string | null
          last_screened_at?: string | null
          linkedin_url?: string | null
          location?: string | null
          market_exposure?: Json | null
          matric_year_raw?: string | null
          months_since_last_qualifying?: number | null
          notice_period_raw?: string | null
          ops_notes?: string | null
          phone?: string | null
          pros?: string[]
          qualifying_months?: number | null
          reasoning?: string | null
          reject_reason?: string | null
          review_status?: string | null
          run_id?: string | null
          salary_expectation_raw?: string | null
          score?: number | null
          screened_on: string
          signals?: Json | null
          skill_version?: string | null
          source?: string | null
          source_file: string
          source_file_slug: string
          typeform_answers?: Json | null
          updated_at?: string
        }
        Update: {
          agent_candidate_id?: string | null
          b2b_or_b2c?: string | null
          bucket?: string
          candidate_id?: string | null
          close_lead_id?: string | null
          close_lead_url?: string | null
          cons?: string[]
          created_at?: string
          current_company?: string | null
          current_title?: string | null
          currently_employed?: boolean | null
          daily_output?: string | null
          date_issues?: string[]
          email?: string | null
          evidence?: string[]
          first_name?: string | null
          flags?: string[]
          full_name?: string
          gaps_to_probe?: string[]
          gate_recency?: string | null
          gate_tenure?: string | null
          id?: string
          identity_check?: string | null
          ingested_via?: string
          is_archived?: boolean
          languages_raw?: string | null
          last_name?: string | null
          last_screened_at?: string | null
          linkedin_url?: string | null
          location?: string | null
          market_exposure?: Json | null
          matric_year_raw?: string | null
          months_since_last_qualifying?: number | null
          notice_period_raw?: string | null
          ops_notes?: string | null
          phone?: string | null
          pros?: string[]
          qualifying_months?: number | null
          reasoning?: string | null
          reject_reason?: string | null
          review_status?: string | null
          run_id?: string | null
          salary_expectation_raw?: string | null
          score?: number | null
          screened_on?: string
          signals?: Json | null
          skill_version?: string | null
          source?: string | null
          source_file?: string
          source_file_slug?: string
          typeform_answers?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cv_screenings_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_metrics: {
        Row: {
          calls: number | null
          clients_won: number | null
          connect_rate: number | null
          connects: number | null
          connects_over_3min: number | null
          conversations: number | null
          created_at: string | null
          date: string
          demos_scheduled: number | null
          department: string
          id: string
          meetings: number | null
          meetings_booked: number | null
          meetings_scheduled: number | null
          notes: string | null
          pitch_calls_scheduled: number | null
          pitch_showup_rate: number | null
          proposals_sent: number | null
          showups: number | null
          total_dials: number | null
          total_talk_time_minutes: number | null
          updated_at: string | null
          user_id: string
          warm_leads: number | null
          workspace: Database["public"]["Enums"]["workspace_type"] | null
        }
        Insert: {
          calls?: number | null
          clients_won?: number | null
          connect_rate?: number | null
          connects?: number | null
          connects_over_3min?: number | null
          conversations?: number | null
          created_at?: string | null
          date: string
          demos_scheduled?: number | null
          department: string
          id?: string
          meetings?: number | null
          meetings_booked?: number | null
          meetings_scheduled?: number | null
          notes?: string | null
          pitch_calls_scheduled?: number | null
          pitch_showup_rate?: number | null
          proposals_sent?: number | null
          showups?: number | null
          total_dials?: number | null
          total_talk_time_minutes?: number | null
          updated_at?: string | null
          user_id: string
          warm_leads?: number | null
          workspace?: Database["public"]["Enums"]["workspace_type"] | null
        }
        Update: {
          calls?: number | null
          clients_won?: number | null
          connect_rate?: number | null
          connects?: number | null
          connects_over_3min?: number | null
          conversations?: number | null
          created_at?: string | null
          date?: string
          demos_scheduled?: number | null
          department?: string
          id?: string
          meetings?: number | null
          meetings_booked?: number | null
          meetings_scheduled?: number | null
          notes?: string | null
          pitch_calls_scheduled?: number | null
          pitch_showup_rate?: number | null
          proposals_sent?: number | null
          showups?: number | null
          total_dials?: number | null
          total_talk_time_minutes?: number | null
          updated_at?: string | null
          user_id?: string
          warm_leads?: number | null
          workspace?: Database["public"]["Enums"]["workspace_type"] | null
        }
        Relationships: []
      }
      department_head_goals: {
        Row: {
          created_at: string
          created_by: string
          department: string
          goal_label: string | null
          goal_type: string
          id: string
          miss_reason: string | null
          outcome: string | null
          outcome_marked_at: string | null
          outcome_marked_by: string | null
          period_start: string
          period_type: string
          project_id: string | null
          subject_user_id: string
          target_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          department: string
          goal_label?: string | null
          goal_type: string
          id?: string
          miss_reason?: string | null
          outcome?: string | null
          outcome_marked_at?: string | null
          outcome_marked_by?: string | null
          period_start: string
          period_type: string
          project_id?: string | null
          subject_user_id: string
          target_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          department?: string
          goal_label?: string | null
          goal_type?: string
          id?: string
          miss_reason?: string | null
          outcome?: string | null
          outcome_marked_at?: string | null
          outcome_marked_by?: string | null
          period_start?: string
          period_type?: string
          project_id?: string | null
          subject_user_id?: string
          target_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_head_goals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_changelog: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          id: string
          published: boolean
          published_at: string | null
          title: string
          updated_at: string
          version: string | null
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string | null
          title: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      dev_mandates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          incentive_model: string | null
          status: Database["public"]["Enums"]["dev_mandate_status"]
          target_metric: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          incentive_model?: string | null
          status?: Database["public"]["Enums"]["dev_mandate_status"]
          target_metric?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          incentive_model?: string | null
          status?: Database["public"]["Enums"]["dev_mandate_status"]
          target_metric?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      dev_project_hours: {
        Row: {
          baseline_hours_week: number | null
          created_at: string
          id: string
          new_hours_week: number | null
          people_count: number
          project_id: string
          reported_at: string | null
          reported_by: string | null
          reported_hours_week: number | null
          role_id: string | null
          role_label: string | null
          updated_at: string
          use_reported: boolean
        }
        Insert: {
          baseline_hours_week?: number | null
          created_at?: string
          id?: string
          new_hours_week?: number | null
          people_count?: number
          project_id: string
          reported_at?: string | null
          reported_by?: string | null
          reported_hours_week?: number | null
          role_id?: string | null
          role_label?: string | null
          updated_at?: string
          use_reported?: boolean
        }
        Update: {
          baseline_hours_week?: number | null
          created_at?: string
          id?: string
          new_hours_week?: number | null
          people_count?: number
          project_id?: string
          reported_at?: string | null
          reported_by?: string | null
          reported_hours_week?: number | null
          role_id?: string | null
          role_label?: string | null
          updated_at?: string
          use_reported?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dev_project_hours_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "dev_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_project_hours_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "dev_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_project_notes: {
        Row: {
          author_id: string
          author_name: string | null
          body: string
          created_at: string
          id: string
          project_id: string
        }
        Insert: {
          author_id: string
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          project_id: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "dev_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_projects: {
        Row: {
          baseline_hours_week: number | null
          billing_model: string
          client: string
          created_at: string
          created_by: string | null
          departments: string[]
          description: string | null
          fee_amount: number | null
          fee_currency: string
          fee_month: string | null
          id: string
          mandate_id: string | null
          new_hours_week: number | null
          owner: string | null
          priority: string
          replaced: string | null
          reported_by: string | null
          reported_hours_week: number | null
          risk_flag: boolean
          risk_note: string | null
          role_id: string | null
          rolled_out_date: string | null
          shipped_at: string | null
          status: string
          stream: string
          target_month: string | null
          target_user_id: string | null
          title: string
          updated_at: string
          use_reported_for_totals: boolean
        }
        Insert: {
          baseline_hours_week?: number | null
          billing_model?: string
          client?: string
          created_at?: string
          created_by?: string | null
          departments?: string[]
          description?: string | null
          fee_amount?: number | null
          fee_currency?: string
          fee_month?: string | null
          id?: string
          mandate_id?: string | null
          new_hours_week?: number | null
          owner?: string | null
          priority?: string
          replaced?: string | null
          reported_by?: string | null
          reported_hours_week?: number | null
          risk_flag?: boolean
          risk_note?: string | null
          role_id?: string | null
          rolled_out_date?: string | null
          shipped_at?: string | null
          status?: string
          stream?: string
          target_month?: string | null
          target_user_id?: string | null
          title: string
          updated_at?: string
          use_reported_for_totals?: boolean
        }
        Update: {
          baseline_hours_week?: number | null
          billing_model?: string
          client?: string
          created_at?: string
          created_by?: string | null
          departments?: string[]
          description?: string | null
          fee_amount?: number | null
          fee_currency?: string
          fee_month?: string | null
          id?: string
          mandate_id?: string | null
          new_hours_week?: number | null
          owner?: string | null
          priority?: string
          replaced?: string | null
          reported_by?: string | null
          reported_hours_week?: number | null
          risk_flag?: boolean
          risk_note?: string | null
          role_id?: string | null
          rolled_out_date?: string | null
          shipped_at?: string | null
          status?: string
          stream?: string
          target_month?: string | null
          target_user_id?: string | null
          title?: string
          updated_at?: string
          use_reported_for_totals?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dev_projects_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "dev_mandates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_projects_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "dev_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_role_targets: {
        Row: {
          build_type: Database["public"]["Enums"]["dev_target_build_type"]
          created_at: string
          id: string
          linked_project_id: string | null
          role_id: string
          status: Database["public"]["Enums"]["dev_target_status"]
          task_name: string
          updated_at: string
        }
        Insert: {
          build_type?: Database["public"]["Enums"]["dev_target_build_type"]
          created_at?: string
          id?: string
          linked_project_id?: string | null
          role_id: string
          status?: Database["public"]["Enums"]["dev_target_status"]
          task_name: string
          updated_at?: string
        }
        Update: {
          build_type?: Database["public"]["Enums"]["dev_target_build_type"]
          created_at?: string
          id?: string
          linked_project_id?: string | null
          role_id?: string
          status?: Database["public"]["Enums"]["dev_target_status"]
          task_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_role_targets_linked_project_id_fkey"
            columns: ["linked_project_id"]
            isOneToOne: false
            referencedRelation: "dev_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_role_targets_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "dev_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_roles: {
        Row: {
          created_at: string
          highest_roi_task: string | null
          id: string
          main_goal: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          highest_roi_task?: string | null
          id?: string
          main_goal?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          highest_roi_task?: string | null
          id?: string
          main_goal?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      dev_stack_tools: {
        Row: {
          created_at: string
          id: string
          layer: string
          name: string
          note: string | null
          status: Database["public"]["Enums"]["dev_stack_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          layer: string
          name: string
          note?: string | null
          status?: Database["public"]["Enums"]["dev_stack_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          layer?: string
          name?: string
          note?: string | null
          status?: Database["public"]["Enums"]["dev_stack_status"]
          updated_at?: string
        }
        Relationships: []
      }
      dev_ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "dev_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_ticket_comments: {
        Row: {
          author_id: string
          author_name: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "dev_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_tickets: {
        Row: {
          assignee_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          priority: string
          reporter_email: string | null
          reporter_id: string
          reporter_name: string | null
          reporter_role: string | null
          resolution_note: string | null
          resolved_at: string | null
          source: string
          status: string
          title: string
          updated_at: string
          url: string | null
          user_agent: string | null
          viewport: string | null
        }
        Insert: {
          assignee_id?: string | null
          category?: string
          created_at?: string
          description: string
          id?: string
          priority?: string
          reporter_email?: string | null
          reporter_id: string
          reporter_name?: string | null
          reporter_role?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
          url?: string | null
          user_agent?: string | null
          viewport?: string | null
        }
        Update: {
          assignee_id?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          reporter_email?: string | null
          reporter_id?: string
          reporter_name?: string | null
          reporter_role?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
          user_agent?: string | null
          viewport?: string | null
        }
        Relationships: []
      }
      employee_attendance: {
        Row: {
          created_at: string
          date: string
          employee_id: string
          id: string
          marked_at: string | null
          marked_by: string | null
          marked_by_role: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          employee_id: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          marked_by_role?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          marked_by_role?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_custom_bonuses: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          cycle_start: string
          id: string
          label: string
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          cycle_start: string
          id?: string
          label: string
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          cycle_start?: string
          id?: string
          label?: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          created_at: string
          document_name: string
          document_type: string
          employee_id: string | null
          expiry_date: string | null
          file_path: string
          id: string
          notes: string | null
          updated_at: string
          uploaded_by: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          document_name: string
          document_type: string
          employee_id?: string | null
          expiry_date?: string | null
          file_path: string
          id?: string
          notes?: string | null
          updated_at?: string
          uploaded_by?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          document_name?: string
          document_type?: string
          employee_id?: string | null
          expiry_date?: string | null
          file_path?: string
          id?: string
          notes?: string | null
          updated_at?: string
          uploaded_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leave_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          doctor_note_path: string | null
          email: string
          full_name: string
          id: string
          leave_days_amount: number
          leave_start_date: string
          reason: string
          return_date: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          doctor_note_path?: string | null
          email: string
          full_name: string
          id?: string
          leave_days_amount: number
          leave_start_date: string
          reason: string
          return_date: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          doctor_note_path?: string | null
          email?: string
          full_name?: string
          id?: string
          leave_days_amount?: number
          leave_start_date?: string
          reason?: string
          return_date?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      employee_offboarding: {
        Row: {
          created_at: string
          employee_email: string | null
          employee_name: string
          employee_profile_id: string | null
          employee_user_id: string | null
          id: string
          initiated_by: string | null
          notes: string | null
          reason: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_email?: string | null
          employee_name: string
          employee_profile_id?: string | null
          employee_user_id?: string | null
          id?: string
          initiated_by?: string | null
          notes?: string | null
          reason?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_email?: string | null
          employee_name?: string
          employee_profile_id?: string | null
          employee_user_id?: string | null
          id?: string
          initiated_by?: string | null
          notes?: string | null
          reason?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_offboarding_employee_profile_id_fkey"
            columns: ["employee_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_offboarding_employee_profile_id_fkey"
            columns: ["employee_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_offboarding_tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          is_completed: boolean | null
          offboarding_id: string
          stage: string
          task_key: string
          task_label: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          offboarding_id: string
          stage: string
          task_key: string
          task_label: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          offboarding_id?: string
          stage?: string
          task_key?: string
          task_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_offboarding_tasks_offboarding_id_fkey"
            columns: ["offboarding_id"]
            isOneToOne: false
            referencedRelation: "employee_offboarding"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_onboarding: {
        Row: {
          assigned_to: string | null
          candidate_email: string | null
          candidate_id: string | null
          candidate_name: string | null
          company_email: string | null
          created_at: string
          created_by: string | null
          cv_screening_id: string | null
          day_one_released_at: string | null
          day_one_released_by: string | null
          employee_id: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          notes: string | null
          onboarding_state: string
          stage: string
          stage_completed_at: string | null
          start_date: string | null
          started_at: string | null
          target_department: string | null
          target_role: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          candidate_email?: string | null
          candidate_id?: string | null
          candidate_name?: string | null
          company_email?: string | null
          created_at?: string
          created_by?: string | null
          cv_screening_id?: string | null
          day_one_released_at?: string | null
          day_one_released_by?: string | null
          employee_id?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          onboarding_state?: string
          stage?: string
          stage_completed_at?: string | null
          start_date?: string | null
          started_at?: string | null
          target_department?: string | null
          target_role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          candidate_email?: string | null
          candidate_id?: string | null
          candidate_name?: string | null
          company_email?: string | null
          created_at?: string
          created_by?: string | null
          cv_screening_id?: string | null
          day_one_released_at?: string | null
          day_one_released_by?: string | null
          employee_id?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          onboarding_state?: string
          stage?: string
          stage_completed_at?: string | null
          start_date?: string | null
          started_at?: string | null
          target_department?: string | null
          target_role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_cv_screening_id_fkey"
            columns: ["cv_screening_id"]
            isOneToOne: false
            referencedRelation: "cv_screenings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_onboarding_tasks: {
        Row: {
          answer_text: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          description: string | null
          document_path: string | null
          id: string
          is_completed: boolean | null
          link_url: string | null
          onboarding_id: string
          proof_path: string | null
          question_prompt: string | null
          sort_order: number | null
          stage: string
          step_type: string
          task_key: string
          task_label: string
          video_url: string | null
        }
        Insert: {
          answer_text?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          document_path?: string | null
          id?: string
          is_completed?: boolean | null
          link_url?: string | null
          onboarding_id: string
          proof_path?: string | null
          question_prompt?: string | null
          sort_order?: number | null
          stage: string
          step_type?: string
          task_key: string
          task_label: string
          video_url?: string | null
        }
        Update: {
          answer_text?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          document_path?: string | null
          id?: string
          is_completed?: boolean | null
          link_url?: string | null
          onboarding_id?: string
          proof_path?: string | null
          question_prompt?: string | null
          sort_order?: number | null
          stage?: string
          step_type?: string
          task_key?: string
          task_label?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_tasks_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "employee_onboarding"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payslips: {
        Row: {
          amount: number | null
          base_salary: number
          bonuses: Json
          bonuses_total: number
          commission: number
          created_at: string
          created_by: string | null
          currency: string
          days_worked: number | null
          deductions: Json
          deductions_total: number
          designation: string | null
          employee_email: string | null
          employee_id: string | null
          employee_name: string | null
          file_path: string | null
          id: string
          leave_balance: number | null
          month: number
          net_pay: number
          notes: string | null
          pay_date: string | null
          payslip_no: string | null
          sent_at: string | null
          sent_date: string | null
          sent_to: string | null
          status: string
          updated_at: string
          user_id: string | null
          year: number
        }
        Insert: {
          amount?: number | null
          base_salary?: number
          bonuses?: Json
          bonuses_total?: number
          commission?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          days_worked?: number | null
          deductions?: Json
          deductions_total?: number
          designation?: string | null
          employee_email?: string | null
          employee_id?: string | null
          employee_name?: string | null
          file_path?: string | null
          id?: string
          leave_balance?: number | null
          month: number
          net_pay?: number
          notes?: string | null
          pay_date?: string | null
          payslip_no?: string | null
          sent_at?: string | null
          sent_date?: string | null
          sent_to?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          year: number
        }
        Update: {
          amount?: number | null
          base_salary?: number
          bonuses?: Json
          bonuses_total?: number
          commission?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          days_worked?: number | null
          deductions?: Json
          deductions_total?: number
          designation?: string | null
          employee_email?: string | null
          employee_id?: string | null
          employee_name?: string | null
          file_path?: string | null
          id?: string
          leave_balance?: number | null
          month?: number
          net_pay?: number
          notes?: string | null
          pay_date?: string | null
          payslip_no?: string | null
          sent_at?: string | null
          sent_date?: string | null
          sent_to?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_requests: {
        Row: {
          company_domain: string | null
          company_name: string | null
          created_at: string
          created_by_user_id: string
          direct_phone: string | null
          email: string | null
          error_message: string | null
          full_name: string | null
          id: string
          linkedin_url: string
          mobile_phone: string | null
          phone_best: string | null
          raw_payload: Json | null
          source: string | null
          status: string
          updated_at: string
          work_phone: string | null
        }
        Insert: {
          company_domain?: string | null
          company_name?: string | null
          created_at?: string
          created_by_user_id: string
          direct_phone?: string | null
          email?: string | null
          error_message?: string | null
          full_name?: string | null
          id?: string
          linkedin_url: string
          mobile_phone?: string | null
          phone_best?: string | null
          raw_payload?: Json | null
          source?: string | null
          status?: string
          updated_at?: string
          work_phone?: string | null
        }
        Update: {
          company_domain?: string | null
          company_name?: string | null
          created_at?: string
          created_by_user_id?: string
          direct_phone?: string | null
          email?: string | null
          error_message?: string | null
          full_name?: string | null
          id?: string
          linkedin_url?: string
          mobile_phone?: string | null
          phone_best?: string | null
          raw_payload?: Json | null
          source?: string | null
          status?: string
          updated_at?: string
          work_phone?: string | null
        }
        Relationships: []
      }
      eod_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          popup_time: string
          target_roles: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          popup_time?: string
          target_roles?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          popup_time?: string
          target_roles?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      form_responses: {
        Row: {
          answers: Json
          booking_id: string | null
          close_lead_id: string | null
          close_pushed_at: string | null
          completed_at: string | null
          created_at: string
          cv_screening_id: string | null
          ending_id: string | null
          form_id: string
          hidden: Json
          id: string
          is_partial: boolean
          is_test: boolean
          marketing_lead_id: string | null
          max_score: number | null
          notes: string | null
          outcome: string | null
          referrer: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number | null
          score_pct: number | null
          started_at: string
          tags: string[]
          token: string
          user_agent: string | null
        }
        Insert: {
          answers?: Json
          booking_id?: string | null
          close_lead_id?: string | null
          close_pushed_at?: string | null
          completed_at?: string | null
          created_at?: string
          cv_screening_id?: string | null
          ending_id?: string | null
          form_id: string
          hidden?: Json
          id?: string
          is_partial?: boolean
          is_test?: boolean
          marketing_lead_id?: string | null
          max_score?: number | null
          notes?: string | null
          outcome?: string | null
          referrer?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          score_pct?: number | null
          started_at?: string
          tags?: string[]
          token: string
          user_agent?: string | null
        }
        Update: {
          answers?: Json
          booking_id?: string | null
          close_lead_id?: string | null
          close_pushed_at?: string | null
          completed_at?: string | null
          created_at?: string
          cv_screening_id?: string | null
          ending_id?: string | null
          form_id?: string
          hidden?: Json
          id?: string
          is_partial?: boolean
          is_test?: boolean
          marketing_lead_id?: string | null
          max_score?: number | null
          notes?: string | null
          outcome?: string | null
          referrer?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          score_pct?: number | null
          started_at?: string
          tags?: string[]
          token?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_versions: {
        Row: {
          form_id: string
          id: string
          published_at: string
          published_by: string | null
          schema: Json
          version: number
        }
        Insert: {
          form_id: string
          id?: string
          published_at?: string
          published_by?: string | null
          schema: Json
          version: number
        }
        Update: {
          form_id?: string
          id?: string
          published_at?: string
          published_by?: string | null
          schema?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_versions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          close_push: boolean
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          notify_emails: string[]
          notify_role: string | null
          published_at: string | null
          published_schema: Json | null
          schema: Json
          sink: string
          slug: string
          status: string
          theme: Json | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          close_push?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name: string
          notify_emails?: string[]
          notify_role?: string | null
          published_at?: string | null
          published_schema?: Json | null
          schema?: Json
          sink?: string
          slug: string
          status?: string
          theme?: Json | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          close_push?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          notify_emails?: string[]
          notify_role?: string | null
          published_at?: string | null
          published_schema?: Json | null
          schema?: Json
          sink?: string
          slug?: string
          status?: string
          theme?: Json | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_settings: {
        Row: {
          id: number
          min_daily_dials: number
          min_daily_talk_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          min_daily_dials?: number
          min_daily_talk_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          min_daily_dials?: number
          min_daily_talk_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      gtm_campaign_metrics: {
        Row: {
          campaign_name: string | null
          connections_accepted: number | null
          connections_sent: number | null
          created_at: string
          heyreach_campaign_id: string
          id: string
          inmails_replied: number | null
          inmails_sent: number | null
          last_event_at: string | null
          messages_replied: number | null
          messages_sent: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          campaign_name?: string | null
          connections_accepted?: number | null
          connections_sent?: number | null
          created_at?: string
          heyreach_campaign_id: string
          id?: string
          inmails_replied?: number | null
          inmails_sent?: number | null
          last_event_at?: string | null
          messages_replied?: number | null
          messages_sent?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          campaign_name?: string | null
          connections_accepted?: number | null
          connections_sent?: number | null
          created_at?: string
          heyreach_campaign_id?: string
          id?: string
          inmails_replied?: number | null
          inmails_sent?: number | null
          last_event_at?: string | null
          messages_replied?: number | null
          messages_sent?: number | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gtm_heyreach_events: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          event_type: string
          id: string
          message_preview: string | null
          payload: Json | null
          prospect_company: string | null
          prospect_linkedin_url: string | null
          prospect_name: string | null
          received_at: string
          sender_email: string | null
          sender_name: string | null
          sentiment: string | null
        }
        Insert: {
          campaign_id?: string | null
          campaign_name?: string | null
          event_type: string
          id?: string
          message_preview?: string | null
          payload?: Json | null
          prospect_company?: string | null
          prospect_linkedin_url?: string | null
          prospect_name?: string | null
          received_at?: string
          sender_email?: string | null
          sender_name?: string | null
          sentiment?: string | null
        }
        Update: {
          campaign_id?: string | null
          campaign_name?: string | null
          event_type?: string
          id?: string
          message_preview?: string | null
          payload?: Json | null
          prospect_company?: string | null
          prospect_linkedin_url?: string | null
          prospect_name?: string | null
          received_at?: string
          sender_email?: string | null
          sender_name?: string | null
          sentiment?: string | null
        }
        Relationships: []
      }
      gtm_sender_accounts: {
        Row: {
          created_at: string
          heyreach_sender_id: number | null
          id: string
          last_activity_at: string | null
          linkedin_url: string | null
          sender_email: string | null
          sender_name: string
          setter_profile_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          heyreach_sender_id?: number | null
          id?: string
          last_activity_at?: string | null
          linkedin_url?: string | null
          sender_email?: string | null
          sender_name: string
          setter_profile_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          heyreach_sender_id?: number | null
          id?: string
          last_activity_at?: string | null
          linkedin_url?: string | null
          sender_email?: string | null
          sender_name?: string
          setter_profile_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gtm_sender_accounts_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_sender_accounts_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_smartlead_campaign_metrics: {
        Row: {
          campaign_name: string | null
          emails_bounced: number
          emails_replied: number
          emails_sent: number
          emails_unsubscribed: number
          id: string
          smartlead_campaign_id: number | null
          updated_at: string
        }
        Insert: {
          campaign_name?: string | null
          emails_bounced?: number
          emails_replied?: number
          emails_sent?: number
          emails_unsubscribed?: number
          id?: string
          smartlead_campaign_id?: number | null
          updated_at?: string
        }
        Update: {
          campaign_name?: string | null
          emails_bounced?: number
          emails_replied?: number
          emails_sent?: number
          emails_unsubscribed?: number
          id?: string
          smartlead_campaign_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      gtm_smartlead_events: {
        Row: {
          campaign_id: number | null
          created_at: string
          email_account_id: number | null
          event_type: string | null
          id: string
          lead_id: number | null
          payload: Json | null
          sentiment: string | null
        }
        Insert: {
          campaign_id?: number | null
          created_at?: string
          email_account_id?: number | null
          event_type?: string | null
          id?: string
          lead_id?: number | null
          payload?: Json | null
          sentiment?: string | null
        }
        Update: {
          campaign_id?: number | null
          created_at?: string
          email_account_id?: number | null
          event_type?: string | null
          id?: string
          lead_id?: number | null
          payload?: Json | null
          sentiment?: string | null
        }
        Relationships: []
      }
      gtm_smartlead_sender_accounts: {
        Row: {
          created_at: string
          email_address: string | null
          id: string
          setter_profile_id: string | null
          smartlead_account_id: number | null
        }
        Insert: {
          created_at?: string
          email_address?: string | null
          id?: string
          setter_profile_id?: string | null
          smartlead_account_id?: number | null
        }
        Update: {
          created_at?: string
          email_address?: string | null
          id?: string
          setter_profile_id?: string | null
          smartlead_account_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_smartlead_sender_accounts_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_smartlead_sender_accounts_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      heyreach_reply_actions: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          meeting_date: string | null
          meeting_id: string | null
          meeting_time: string | null
          notes: string | null
          outcome: string
          setter_user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          meeting_date?: string | null
          meeting_id?: string | null
          meeting_time?: string | null
          notes?: string | null
          outcome: string
          setter_user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          meeting_date?: string | null
          meeting_id?: string | null
          meeting_time?: string | null
          notes?: string | null
          outcome?: string
          setter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "heyreach_reply_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "gtm_heyreach_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heyreach_reply_actions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      hourly_update_settings: {
        Row: {
          enabled: boolean
          id: string
          target_roles: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          id?: string
          target_roles?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          id?: string
          target_roles?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hourly_update_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hourly_updates: {
        Row: {
          connects_count: number
          created_at: string
          date: string
          dials_count: number
          hour_slot: number
          id: string
          submitted_at: string
          submitted_at_uk: string | null
          support_needed: string | null
          talk_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connects_count?: number
          created_at?: string
          date?: string
          dials_count?: number
          hour_slot: number
          id?: string
          submitted_at?: string
          submitted_at_uk?: string | null
          support_needed?: string | null
          talk_time?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connects_count?: number
          created_at?: string
          date?: string
          dials_count?: number
          hour_slot?: number
          id?: string
          submitted_at?: string
          submitted_at_uk?: string | null
          support_needed?: string | null
          talk_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hourly_updates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_starter_checklist_items: {
        Row: {
          done_at: string | null
          done_by: string | null
          employee_onboarding_id: string
          id: string
          label: string
          note: string | null
          template_key: string
        }
        Insert: {
          done_at?: string | null
          done_by?: string | null
          employee_onboarding_id: string
          id?: string
          label: string
          note?: string | null
          template_key: string
        }
        Update: {
          done_at?: string | null
          done_by?: string | null
          employee_onboarding_id?: string
          id?: string
          label?: string
          note?: string | null
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_starter_checklist_items_employee_onboarding_id_fkey"
            columns: ["employee_onboarding_id"]
            isOneToOne: false
            referencedRelation: "employee_onboarding"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_starter_checklist_templates: {
        Row: {
          enabled: boolean
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          enabled?: boolean
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          enabled?: boolean
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      impersonation_log: {
        Row: {
          created_at: string
          id: string
          impersonator_email: string | null
          impersonator_id: string
          target_email: string | null
          target_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          impersonator_email?: string | null
          impersonator_id: string
          target_email?: string | null
          target_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          impersonator_email?: string | null
          impersonator_id?: string
          target_email?: string | null
          target_user_id?: string
        }
        Relationships: []
      }
      individual_targets: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          metric: string
          period: string
          role: string
          subject_profile_id: string
          target_value: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          metric: string
          period: string
          role: string
          subject_profile_id: string
          target_value: number
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          metric?: string
          period?: string
          role?: string
          subject_profile_id?: string
          target_value?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      internal_meeting_actions: {
        Row: {
          assignee_name: string | null
          assignee_user_id: string | null
          carried_to_log_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          id: string
          log_id: string
          meeting_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assignee_name?: string | null
          assignee_user_id?: string | null
          carried_to_log_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date?: string | null
          id?: string
          log_id: string
          meeting_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assignee_name?: string | null
          assignee_user_id?: string | null
          carried_to_log_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          log_id?: string
          meeting_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_meeting_actions_carried_to_log_id_fkey"
            columns: ["carried_to_log_id"]
            isOneToOne: false
            referencedRelation: "internal_meeting_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_meeting_actions_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "internal_meeting_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_meeting_actions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "internal_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_meeting_logs: {
        Row: {
          agenda: string | null
          attendee_notes: string | null
          attendee_user_ids: string[]
          created_at: string
          created_by: string | null
          decisions: string | null
          duration_minutes: number | null
          fathom_link: string | null
          held_on: string
          id: string
          meeting_id: string
          notes: string | null
          start_time: string | null
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          attendee_notes?: string | null
          attendee_user_ids?: string[]
          created_at?: string
          created_by?: string | null
          decisions?: string | null
          duration_minutes?: number | null
          fathom_link?: string | null
          held_on: string
          id?: string
          meeting_id: string
          notes?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          attendee_notes?: string | null
          attendee_user_ids?: string[]
          created_at?: string
          created_by?: string | null
          decisions?: string | null
          duration_minutes?: number | null
          fathom_link?: string | null
          held_on?: string
          id?: string
          meeting_id?: string
          notes?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_meeting_logs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "internal_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_meetings: {
        Row: {
          cadence: string
          created_at: string
          created_by: string | null
          default_time: string | null
          external_participants: string | null
          id: string
          is_active: boolean
          month_day: number | null
          name: string
          owner_user_id: string | null
          participant_user_ids: string[]
          sort_order: number
          standing_agenda: string | null
          team: string | null
          updated_at: string
          weekday: number | null
        }
        Insert: {
          cadence: string
          created_at?: string
          created_by?: string | null
          default_time?: string | null
          external_participants?: string | null
          id?: string
          is_active?: boolean
          month_day?: number | null
          name: string
          owner_user_id?: string | null
          participant_user_ids?: string[]
          sort_order?: number
          standing_agenda?: string | null
          team?: string | null
          updated_at?: string
          weekday?: number | null
        }
        Update: {
          cadence?: string
          created_at?: string
          created_by?: string | null
          default_time?: string | null
          external_participants?: string | null
          id?: string
          is_active?: boolean
          month_day?: number | null
          name?: string
          owner_user_id?: string | null
          participant_user_ids?: string[]
          sort_order?: number
          standing_agenda?: string | null
          team?: string | null
          updated_at?: string
          weekday?: number | null
        }
        Relationships: []
      }
      interviews: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          interview_date: string
          interview_time: string | null
          interview_type: string
          notes: string | null
          outcome: string
          recorded_by: string | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          interview_date: string
          interview_time?: string | null
          interview_type: string
          notes?: string | null
          outcome?: string
          recorded_by?: string | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          interview_date?: string
          interview_time?: string | null
          interview_type?: string
          notes?: string | null
          outcome?: string
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          invite_code: string
          invited_email: string
          role: Database["public"]["Enums"]["app_role"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          invite_code: string
          invited_email: string
          role: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          invite_code?: string
          invited_email?: string
          role?: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      invoice_audit_log: {
        Row: {
          accounting_record_id: string
          action: string
          created_at: string
          details: Json | null
          id: string
          performed_by: string
        }
        Insert: {
          accounting_record_id: string
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by: string
        }
        Update: {
          accounting_record_id?: string
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_audit_log_accounting_record_id_fkey"
            columns: ["accounting_record_id"]
            isOneToOne: false
            referencedRelation: "accounting_records"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_submissions: {
        Row: {
          account_holder_name: string | null
          account_number: string | null
          account_type: string | null
          amended_at: string | null
          amendment_notes: string | null
          bank_address: string | null
          bank_country: string | null
          bank_name: string | null
          base_salary: number | null
          bonus_approved: Json | null
          bonus_entries: Json | null
          bonus_total: number | null
          branch_code: string | null
          cash_collected: number | null
          commission_percentage: number | null
          compiled_by: string | null
          created_at: string
          currency: string | null
          custom_bonuses: Json | null
          cycle_compiled_at: string | null
          deductions: Json | null
          deductions_total: number | null
          department: string | null
          grand_total: number | null
          home_address: string | null
          iban: string | null
          id: string
          is_amended: boolean | null
          is_first_salary: boolean | null
          line_type: string
          manual_meetings: Json | null
          manual_meetings_count: number | null
          meeting_ids: string[]
          meetings_count: number
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          per_meeting_bonus: number
          period_end: string
          period_start: string
          reviewed_at: string | null
          reviewed_by: string | null
          sat_meetings_count: number | null
          sat_source: string | null
          setter_profile_id: string | null
          status: string
          submitted_at: string
          swift_bic: string | null
          tiered_bonus_amount: number | null
          tiered_bonus_tier: number | null
          total_commission: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_holder_name?: string | null
          account_number?: string | null
          account_type?: string | null
          amended_at?: string | null
          amendment_notes?: string | null
          bank_address?: string | null
          bank_country?: string | null
          bank_name?: string | null
          base_salary?: number | null
          bonus_approved?: Json | null
          bonus_entries?: Json | null
          bonus_total?: number | null
          branch_code?: string | null
          cash_collected?: number | null
          commission_percentage?: number | null
          compiled_by?: string | null
          created_at?: string
          currency?: string | null
          custom_bonuses?: Json | null
          cycle_compiled_at?: string | null
          deductions?: Json | null
          deductions_total?: number | null
          department?: string | null
          grand_total?: number | null
          home_address?: string | null
          iban?: string | null
          id?: string
          is_amended?: boolean | null
          is_first_salary?: boolean | null
          line_type?: string
          manual_meetings?: Json | null
          manual_meetings_count?: number | null
          meeting_ids?: string[]
          meetings_count?: number
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          per_meeting_bonus?: number
          period_end: string
          period_start: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sat_meetings_count?: number | null
          sat_source?: string | null
          setter_profile_id?: string | null
          status?: string
          submitted_at?: string
          swift_bic?: string | null
          tiered_bonus_amount?: number | null
          tiered_bonus_tier?: number | null
          total_commission?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string | null
          account_type?: string | null
          amended_at?: string | null
          amendment_notes?: string | null
          bank_address?: string | null
          bank_country?: string | null
          bank_name?: string | null
          base_salary?: number | null
          bonus_approved?: Json | null
          bonus_entries?: Json | null
          bonus_total?: number | null
          branch_code?: string | null
          cash_collected?: number | null
          commission_percentage?: number | null
          compiled_by?: string | null
          created_at?: string
          currency?: string | null
          custom_bonuses?: Json | null
          cycle_compiled_at?: string | null
          deductions?: Json | null
          deductions_total?: number | null
          department?: string | null
          grand_total?: number | null
          home_address?: string | null
          iban?: string | null
          id?: string
          is_amended?: boolean | null
          is_first_salary?: boolean | null
          line_type?: string
          manual_meetings?: Json | null
          manual_meetings_count?: number | null
          meeting_ids?: string[]
          meetings_count?: number
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          per_meeting_bonus?: number
          period_end?: string
          period_start?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sat_meetings_count?: number | null
          sat_source?: string | null
          setter_profile_id?: string | null
          status?: string
          submitted_at?: string
          swift_bic?: string | null
          tiered_bonus_amount?: number | null
          tiered_bonus_tier?: number | null
          total_commission?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_submissions_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_submissions_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          bill_to_address: string | null
          bill_to_name: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          file_path: string | null
          id: string
          invoice_number: string
          issue_date: string | null
          line_description: string | null
          notes: string | null
          paid_at: string | null
          paid_marked_by: string | null
          recipient_email: string | null
          resend_email_id: string | null
          send_count: number
          sent_at: string | null
          sent_by: string | null
          sent_to: string | null
          status: string
          total_amount: number | null
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          amount: number
          bill_to_address?: string | null
          bill_to_name?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          file_path?: string | null
          id?: string
          invoice_number: string
          issue_date?: string | null
          line_description?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_marked_by?: string | null
          recipient_email?: string | null
          resend_email_id?: string | null
          send_count?: number
          sent_at?: string | null
          sent_by?: string | null
          sent_to?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          amount?: number
          bill_to_address?: string | null
          bill_to_name?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          file_path?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string | null
          line_description?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_marked_by?: string | null
          recipient_email?: string | null
          resend_email_id?: string | null
          send_count?: number
          sent_at?: string | null
          sent_by?: string | null
          sent_to?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_application_forms: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          jotform_embed_url: string
          role_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          jotform_embed_url: string
          role_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          jotform_embed_url?: string
          role_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      job_application_submissions: {
        Row: {
          candidate_name: string
          created_at: string | null
          email: string | null
          form_id: string | null
          id: string
          jotform_submission_id: string | null
          notes: string | null
          phone: string | null
          reviewed_by: string | null
          role_applied: string
          score: number | null
          status: string | null
          submission_date: string
          updated_at: string | null
        }
        Insert: {
          candidate_name: string
          created_at?: string | null
          email?: string | null
          form_id?: string | null
          id?: string
          jotform_submission_id?: string | null
          notes?: string | null
          phone?: string | null
          reviewed_by?: string | null
          role_applied: string
          score?: number | null
          status?: string | null
          submission_date?: string
          updated_at?: string | null
        }
        Update: {
          candidate_name?: string
          created_at?: string | null
          email?: string | null
          form_id?: string | null
          id?: string
          jotform_submission_id?: string | null
          notes?: string | null
          phone?: string | null
          reviewed_by?: string | null
          role_applied?: string
          score?: number | null
          status?: string | null
          submission_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_application_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "job_application_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_achievements: {
        Row: {
          achievement_definition_id: string | null
          achievement_key: string
          created_at: string | null
          date_awarded: string
          email: string
          id: string
          month_awarded: string | null
          progress_snapshot: Json | null
          tier: string | null
        }
        Insert: {
          achievement_definition_id?: string | null
          achievement_key: string
          created_at?: string | null
          date_awarded?: string
          email: string
          id?: string
          month_awarded?: string | null
          progress_snapshot?: Json | null
          tier?: string | null
        }
        Update: {
          achievement_definition_id?: string | null
          achievement_key?: string
          created_at?: string | null
          date_awarded?: string
          email?: string
          id?: string
          month_awarded?: string | null
          progress_snapshot?: Json | null
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_achievements_achievement_definition_id_fkey"
            columns: ["achievement_definition_id"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_awards: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          email: string
          id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date: string
          email: string
          id?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          email?: string
          id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      leaderboard_bonuses: {
        Row: {
          active: boolean | null
          amount: string
          created_at: string | null
          created_by: string | null
          description: string
          end_date: string
          id: string
          meeting_goal: number | null
          reward_type: string | null
          start_date: string
          status: string
          title: string
          tracking_source: string
          type: string
          updated_at: string | null
          winner_approved_at: string | null
          winner_approved_by: string | null
          winner_email: string | null
        }
        Insert: {
          active?: boolean | null
          amount: string
          created_at?: string | null
          created_by?: string | null
          description: string
          end_date: string
          id?: string
          meeting_goal?: number | null
          reward_type?: string | null
          start_date: string
          status?: string
          title: string
          tracking_source?: string
          type: string
          updated_at?: string | null
          winner_approved_at?: string | null
          winner_approved_by?: string | null
          winner_email?: string | null
        }
        Update: {
          active?: boolean | null
          amount?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          end_date?: string
          id?: string
          meeting_goal?: number | null
          reward_type?: string | null
          start_date?: string
          status?: string
          title?: string
          tracking_source?: string
          type?: string
          updated_at?: string | null
          winner_approved_at?: string | null
          winner_approved_by?: string | null
          winner_email?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_client_id: string | null
          assigned_setter_id: string | null
          callback_date: string | null
          callback_time: string | null
          close_lead_id: string | null
          company_name: string
          company_website: string | null
          contact_name: string
          created_at: string
          email: string | null
          id: string
          industry: string | null
          linkedin_url: string | null
          mobile: string | null
          notes: string | null
          prospect_job_title: string | null
          setter_id: string
          source: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          assigned_client_id?: string | null
          assigned_setter_id?: string | null
          callback_date?: string | null
          callback_time?: string | null
          close_lead_id?: string | null
          company_name: string
          company_website?: string | null
          contact_name: string
          created_at?: string
          email?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          mobile?: string | null
          notes?: string | null
          prospect_job_title?: string | null
          setter_id: string
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          assigned_client_id?: string | null
          assigned_setter_id?: string | null
          callback_date?: string | null
          callback_time?: string | null
          close_lead_id?: string | null
          company_name?: string
          company_website?: string | null
          contact_name?: string
          created_at?: string
          email?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          mobile?: string | null
          notes?: string | null
          prospect_job_title?: string | null
          setter_id?: string
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_client_id_fkey"
            columns: ["assigned_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_daily_metrics: {
        Row: {
          ae_dials: number | null
          candidate_dials: number | null
          candidates_screened: number | null
          cash_collected: number | null
          close_rate_pct: number | null
          closing_calls_booked: number | null
          closing_calls_scheduled: number | null
          closing_calls_set: number | null
          conversations: number | null
          created_at: string
          date: string
          deals_closed: number | null
          department: Database["public"]["Enums"]["metrics_department"]
          dials: number | null
          disco_show_rate: number | null
          disco_to_closing_pct: number | null
          discoveries_scheduled: number | null
          discoveries_set: number | null
          entered_by: string
          id: string
          invited_to_interview: number | null
          meetings_booked_app: number | null
          meetings_booked_input: number | null
          mismatch_flag:
            | Database["public"]["Enums"]["mismatch_flag_type"]
            | null
          mismatch_notified: boolean | null
          new_trial_calls_booked: number | null
          prospects_reactivated: number | null
          sdrs_hired: number | null
          set_to_interview_pct: number | null
          talk_time_minutes: number | null
          target_role: Database["public"]["Enums"]["metrics_target_role"]
          target_user_id: string
          team_conversations: number | null
          team_dials: number | null
          team_meetings_booked: number | null
          team_talk_time: number | null
          team_warm_leads: number | null
          training_sessions_booked: number | null
          trial_calls_scheduled: number | null
          trial_calls_set: number | null
          updated_at: string
          warm_leads: number | null
        }
        Insert: {
          ae_dials?: number | null
          candidate_dials?: number | null
          candidates_screened?: number | null
          cash_collected?: number | null
          close_rate_pct?: number | null
          closing_calls_booked?: number | null
          closing_calls_scheduled?: number | null
          closing_calls_set?: number | null
          conversations?: number | null
          created_at?: string
          date: string
          deals_closed?: number | null
          department: Database["public"]["Enums"]["metrics_department"]
          dials?: number | null
          disco_show_rate?: number | null
          disco_to_closing_pct?: number | null
          discoveries_scheduled?: number | null
          discoveries_set?: number | null
          entered_by: string
          id?: string
          invited_to_interview?: number | null
          meetings_booked_app?: number | null
          meetings_booked_input?: number | null
          mismatch_flag?:
            | Database["public"]["Enums"]["mismatch_flag_type"]
            | null
          mismatch_notified?: boolean | null
          new_trial_calls_booked?: number | null
          prospects_reactivated?: number | null
          sdrs_hired?: number | null
          set_to_interview_pct?: number | null
          talk_time_minutes?: number | null
          target_role: Database["public"]["Enums"]["metrics_target_role"]
          target_user_id: string
          team_conversations?: number | null
          team_dials?: number | null
          team_meetings_booked?: number | null
          team_talk_time?: number | null
          team_warm_leads?: number | null
          training_sessions_booked?: number | null
          trial_calls_scheduled?: number | null
          trial_calls_set?: number | null
          updated_at?: string
          warm_leads?: number | null
        }
        Update: {
          ae_dials?: number | null
          candidate_dials?: number | null
          candidates_screened?: number | null
          cash_collected?: number | null
          close_rate_pct?: number | null
          closing_calls_booked?: number | null
          closing_calls_scheduled?: number | null
          closing_calls_set?: number | null
          conversations?: number | null
          created_at?: string
          date?: string
          deals_closed?: number | null
          department?: Database["public"]["Enums"]["metrics_department"]
          dials?: number | null
          disco_show_rate?: number | null
          disco_to_closing_pct?: number | null
          discoveries_scheduled?: number | null
          discoveries_set?: number | null
          entered_by?: string
          id?: string
          invited_to_interview?: number | null
          meetings_booked_app?: number | null
          meetings_booked_input?: number | null
          mismatch_flag?:
            | Database["public"]["Enums"]["mismatch_flag_type"]
            | null
          mismatch_notified?: boolean | null
          new_trial_calls_booked?: number | null
          prospects_reactivated?: number | null
          sdrs_hired?: number | null
          set_to_interview_pct?: number | null
          talk_time_minutes?: number | null
          target_role?: Database["public"]["Enums"]["metrics_target_role"]
          target_user_id?: string
          team_conversations?: number | null
          team_dials?: number | null
          team_meetings_booked?: number | null
          team_talk_time?: number | null
          team_warm_leads?: number | null
          training_sessions_booked?: number | null
          trial_calls_scheduled?: number | null
          trial_calls_set?: number | null
          updated_at?: string
          warm_leads?: number | null
        }
        Relationships: []
      }
      marketing_leads: {
        Row: {
          actioned_at: string | null
          booking_url: string | null
          campaign_name: string | null
          company_name: string | null
          created_at: string
          email: string | null
          heyreach_event_id: string | null
          id: string
          is_partial: boolean
          name: string | null
          outcome: string | null
          phone: string | null
          qualification: string | null
          raw: Json | null
          revenue_band: string | null
          seen_at: string | null
          sentiment: string | null
          source: string
          submitted_at: string | null
          typeform_response_token: string | null
          updated_at: string
        }
        Insert: {
          actioned_at?: string | null
          booking_url?: string | null
          campaign_name?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          heyreach_event_id?: string | null
          id?: string
          is_partial?: boolean
          name?: string | null
          outcome?: string | null
          phone?: string | null
          qualification?: string | null
          raw?: Json | null
          revenue_band?: string | null
          seen_at?: string | null
          sentiment?: string | null
          source: string
          submitted_at?: string | null
          typeform_response_token?: string | null
          updated_at?: string
        }
        Update: {
          actioned_at?: string | null
          booking_url?: string | null
          campaign_name?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          heyreach_event_id?: string | null
          id?: string
          is_partial?: boolean
          name?: string | null
          outcome?: string | null
          phone?: string | null
          qualification?: string | null
          raw?: Json | null
          revenue_band?: string | null
          seen_at?: string | null
          sentiment?: string | null
          source?: string
          submitted_at?: string | null
          typeform_response_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_leads_heyreach_event_id_fkey"
            columns: ["heyreach_event_id"]
            isOneToOne: true
            referencedRelation: "gtm_heyreach_events"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_logs: {
        Row: {
          achieved: boolean | null
          blocker: string | null
          conversations_goal: number | null
          created_at: string | null
          date: string
          goal: string | null
          id: string
          meeting_type: string
          meetings_goal: number | null
          reason_not_achieved: string | null
          setter_id: string
          updated_at: string | null
        }
        Insert: {
          achieved?: boolean | null
          blocker?: string | null
          conversations_goal?: number | null
          created_at?: string | null
          date: string
          goal?: string | null
          id?: string
          meeting_type: string
          meetings_goal?: number | null
          reason_not_achieved?: string | null
          setter_id: string
          updated_at?: string | null
        }
        Update: {
          achieved?: boolean | null
          blocker?: string | null
          conversations_goal?: number | null
          created_at?: string | null
          date?: string
          goal?: string | null
          id?: string
          meeting_type?: string
          meetings_goal?: number | null
          reason_not_achieved?: string | null
          setter_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      meeting_scores: {
        Row: {
          appointment_id: string | null
          authority: number
          client_name: string
          created_at: string
          engagement: number
          fit: number
          id: string
          matched: boolean
          meeting_date: string
          next_step: number
          notes: string | null
          overall_quality: number | null
          prospect_company: string
          scored_by: string | null
          setter_name: string
          source: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          authority: number
          client_name: string
          created_at?: string
          engagement: number
          fit: number
          id?: string
          matched?: boolean
          meeting_date: string
          next_step: number
          notes?: string | null
          overall_quality?: number | null
          prospect_company?: string
          scored_by?: string | null
          setter_name: string
          source?: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          authority?: number
          client_name?: string
          created_at?: string
          engagement?: number
          fit?: number
          id?: string
          matched?: boolean
          meeting_date?: string
          next_step?: number
          notes?: string | null
          overall_quality?: number | null
          prospect_company?: string
          scored_by?: string | null
          setter_name?: string
          source?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_scores_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          accepted_by_client: boolean | null
          ae_outcome_reminder_sent: boolean | null
          ae_today_reminder_sent: boolean | null
          agency_led: string | null
          appointment_source: string | null
          approved_at: string | null
          approved_by: string | null
          approved_by_admin: boolean | null
          assigned_ae_id: string | null
          assigned_to_client: boolean | null
          attendance_confirmed: boolean | null
          attendance_status: string | null
          bd_bottleneck: string | null
          campaign_id: string | null
          capacity_5_10: boolean | null
          client_accepted: boolean | null
          client_confirmed_attendance: boolean | null
          client_feedback_accepted: boolean | null
          client_feedback_comments: string | null
          client_feedback_decline_reason: string | null
          client_feedback_followup_booked: boolean | null
          client_feedback_link: string | null
          client_feedback_rating: number | null
          client_feedback_sat: boolean | null
          client_feedback_submitted_at: string | null
          client_feedback_terms_sent: boolean | null
          client_has_account: boolean | null
          client_id: string | null
          client_outcome: string | null
          client_profile_id: string | null
          client_user_id: string | null
          close_lead_link: string | null
          company_headcount: string | null
          company_name: string
          company_website: string | null
          created_at: string
          csm_one_hour_reminder_sent: boolean | null
          csm_sat_reminder_sent: boolean | null
          currently_hiring: boolean | null
          cv_candidate_level: string | null
          cv_candidate_titles: string | null
          decision_maker_email: string | null
          decision_maker_name: string | null
          decision_maker_status: string | null
          department: string | null
          edited_at: string | null
          edited_by: string | null
          follow_up_sent: boolean | null
          google_meet_link: string | null
          hiring_decision_maker: string | null
          hiring_difficulties: string | null
          hiring_frequency: string | null
          id: string
          is_pipeline_reengagement: boolean
          is_rebook: boolean | null
          job_roles: Json | null
          job_spec_file_url: string | null
          job_spec_provided: boolean | null
          job_spec_text: string | null
          job_specs: Json | null
          lead_type: string | null
          logged_by_manager_id: string | null
          logged_by_setter_id: string | null
          meeting_date: string
          meeting_time: string
          moved_from: string | null
          needs_setter_rebook: boolean
          next_job_title: string | null
          notes: string | null
          only_decision_maker: boolean | null
          open_to_receiving_cvs: boolean | null
          original_meeting_id: string | null
          other_decision_makers: boolean | null
          other_notes: string | null
          outcome_confirmed_at: string | null
          outcome_notes: string | null
          pain_points: string | null
          placement_fee_percentage: number | null
          pre_meeting_insights: Json | null
          price_qualified: boolean | null
          price_qualified_reason: string | null
          prospect_email: string
          prospect_job_title: string | null
          prospect_linkedin: string | null
          prospect_mobile: string | null
          prospect_name: string
          prospect_watched_video: boolean | null
          reminder_sent: boolean | null
          revenue_last_12_months: string | null
          scoring_exempt: boolean
          scoring_exempt_at: string | null
          scoring_exempt_by: string | null
          scoring_exempt_reason: string | null
          sector: string | null
          sector_over_1000_companies: boolean | null
          setter_id: string | null
          setter_profile_id: string | null
          source_referral_id: string | null
          start_timeline: string | null
          start_timeline_reason: string | null
          status: string | null
          tam_reason: string | null
          target_job_titles: string | null
          terms_fees: string | null
          trial_lead_id: string | null
          updated_at: string
          vacancies_from_new_clients_last_month: string | null
          vacancies_value: number | null
          vacancies_won: number | null
          verbal_acceptance: boolean | null
          worked_with_agencies: boolean | null
          worked_with_lead_gen_agency: string | null
        }
        Insert: {
          accepted_by_client?: boolean | null
          ae_outcome_reminder_sent?: boolean | null
          ae_today_reminder_sent?: boolean | null
          agency_led?: string | null
          appointment_source?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_admin?: boolean | null
          assigned_ae_id?: string | null
          assigned_to_client?: boolean | null
          attendance_confirmed?: boolean | null
          attendance_status?: string | null
          bd_bottleneck?: string | null
          campaign_id?: string | null
          capacity_5_10?: boolean | null
          client_accepted?: boolean | null
          client_confirmed_attendance?: boolean | null
          client_feedback_accepted?: boolean | null
          client_feedback_comments?: string | null
          client_feedback_decline_reason?: string | null
          client_feedback_followup_booked?: boolean | null
          client_feedback_link?: string | null
          client_feedback_rating?: number | null
          client_feedback_sat?: boolean | null
          client_feedback_submitted_at?: string | null
          client_feedback_terms_sent?: boolean | null
          client_has_account?: boolean | null
          client_id?: string | null
          client_outcome?: string | null
          client_profile_id?: string | null
          client_user_id?: string | null
          close_lead_link?: string | null
          company_headcount?: string | null
          company_name: string
          company_website?: string | null
          created_at?: string
          csm_one_hour_reminder_sent?: boolean | null
          csm_sat_reminder_sent?: boolean | null
          currently_hiring?: boolean | null
          cv_candidate_level?: string | null
          cv_candidate_titles?: string | null
          decision_maker_email?: string | null
          decision_maker_name?: string | null
          decision_maker_status?: string | null
          department?: string | null
          edited_at?: string | null
          edited_by?: string | null
          follow_up_sent?: boolean | null
          google_meet_link?: string | null
          hiring_decision_maker?: string | null
          hiring_difficulties?: string | null
          hiring_frequency?: string | null
          id?: string
          is_pipeline_reengagement?: boolean
          is_rebook?: boolean | null
          job_roles?: Json | null
          job_spec_file_url?: string | null
          job_spec_provided?: boolean | null
          job_spec_text?: string | null
          job_specs?: Json | null
          lead_type?: string | null
          logged_by_manager_id?: string | null
          logged_by_setter_id?: string | null
          meeting_date: string
          meeting_time: string
          moved_from?: string | null
          needs_setter_rebook?: boolean
          next_job_title?: string | null
          notes?: string | null
          only_decision_maker?: boolean | null
          open_to_receiving_cvs?: boolean | null
          original_meeting_id?: string | null
          other_decision_makers?: boolean | null
          other_notes?: string | null
          outcome_confirmed_at?: string | null
          outcome_notes?: string | null
          pain_points?: string | null
          placement_fee_percentage?: number | null
          pre_meeting_insights?: Json | null
          price_qualified?: boolean | null
          price_qualified_reason?: string | null
          prospect_email: string
          prospect_job_title?: string | null
          prospect_linkedin?: string | null
          prospect_mobile?: string | null
          prospect_name: string
          prospect_watched_video?: boolean | null
          reminder_sent?: boolean | null
          revenue_last_12_months?: string | null
          scoring_exempt?: boolean
          scoring_exempt_at?: string | null
          scoring_exempt_by?: string | null
          scoring_exempt_reason?: string | null
          sector?: string | null
          sector_over_1000_companies?: boolean | null
          setter_id?: string | null
          setter_profile_id?: string | null
          source_referral_id?: string | null
          start_timeline?: string | null
          start_timeline_reason?: string | null
          status?: string | null
          tam_reason?: string | null
          target_job_titles?: string | null
          terms_fees?: string | null
          trial_lead_id?: string | null
          updated_at?: string
          vacancies_from_new_clients_last_month?: string | null
          vacancies_value?: number | null
          vacancies_won?: number | null
          verbal_acceptance?: boolean | null
          worked_with_agencies?: boolean | null
          worked_with_lead_gen_agency?: string | null
        }
        Update: {
          accepted_by_client?: boolean | null
          ae_outcome_reminder_sent?: boolean | null
          ae_today_reminder_sent?: boolean | null
          agency_led?: string | null
          appointment_source?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_admin?: boolean | null
          assigned_ae_id?: string | null
          assigned_to_client?: boolean | null
          attendance_confirmed?: boolean | null
          attendance_status?: string | null
          bd_bottleneck?: string | null
          campaign_id?: string | null
          capacity_5_10?: boolean | null
          client_accepted?: boolean | null
          client_confirmed_attendance?: boolean | null
          client_feedback_accepted?: boolean | null
          client_feedback_comments?: string | null
          client_feedback_decline_reason?: string | null
          client_feedback_followup_booked?: boolean | null
          client_feedback_link?: string | null
          client_feedback_rating?: number | null
          client_feedback_sat?: boolean | null
          client_feedback_submitted_at?: string | null
          client_feedback_terms_sent?: boolean | null
          client_has_account?: boolean | null
          client_id?: string | null
          client_outcome?: string | null
          client_profile_id?: string | null
          client_user_id?: string | null
          close_lead_link?: string | null
          company_headcount?: string | null
          company_name?: string
          company_website?: string | null
          created_at?: string
          csm_one_hour_reminder_sent?: boolean | null
          csm_sat_reminder_sent?: boolean | null
          currently_hiring?: boolean | null
          cv_candidate_level?: string | null
          cv_candidate_titles?: string | null
          decision_maker_email?: string | null
          decision_maker_name?: string | null
          decision_maker_status?: string | null
          department?: string | null
          edited_at?: string | null
          edited_by?: string | null
          follow_up_sent?: boolean | null
          google_meet_link?: string | null
          hiring_decision_maker?: string | null
          hiring_difficulties?: string | null
          hiring_frequency?: string | null
          id?: string
          is_pipeline_reengagement?: boolean
          is_rebook?: boolean | null
          job_roles?: Json | null
          job_spec_file_url?: string | null
          job_spec_provided?: boolean | null
          job_spec_text?: string | null
          job_specs?: Json | null
          lead_type?: string | null
          logged_by_manager_id?: string | null
          logged_by_setter_id?: string | null
          meeting_date?: string
          meeting_time?: string
          moved_from?: string | null
          needs_setter_rebook?: boolean
          next_job_title?: string | null
          notes?: string | null
          only_decision_maker?: boolean | null
          open_to_receiving_cvs?: boolean | null
          original_meeting_id?: string | null
          other_decision_makers?: boolean | null
          other_notes?: string | null
          outcome_confirmed_at?: string | null
          outcome_notes?: string | null
          pain_points?: string | null
          placement_fee_percentage?: number | null
          pre_meeting_insights?: Json | null
          price_qualified?: boolean | null
          price_qualified_reason?: string | null
          prospect_email?: string
          prospect_job_title?: string | null
          prospect_linkedin?: string | null
          prospect_mobile?: string | null
          prospect_name?: string
          prospect_watched_video?: boolean | null
          reminder_sent?: boolean | null
          revenue_last_12_months?: string | null
          scoring_exempt?: boolean
          scoring_exempt_at?: string | null
          scoring_exempt_by?: string | null
          scoring_exempt_reason?: string | null
          sector?: string | null
          sector_over_1000_companies?: boolean | null
          setter_id?: string | null
          setter_profile_id?: string | null
          source_referral_id?: string | null
          start_timeline?: string | null
          start_timeline_reason?: string | null
          status?: string | null
          tam_reason?: string | null
          target_job_titles?: string | null
          terms_fees?: string | null
          trial_lead_id?: string | null
          updated_at?: string
          vacancies_from_new_clients_last_month?: string | null
          vacancies_value?: number | null
          vacancies_won?: number | null
          verbal_acceptance?: boolean | null
          worked_with_agencies?: boolean | null
          worked_with_lead_gen_agency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_assigned_ae_id_fkey"
            columns: ["assigned_ae_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_original_meeting_id_fkey"
            columns: ["original_meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_source_referral_id_fkey"
            columns: ["source_referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_trial_lead_id_fkey"
            columns: ["trial_lead_id"]
            isOneToOne: false
            referencedRelation: "trial_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      midday_report_settings: {
        Row: {
          enabled: boolean
          id: string
          target_roles: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          id?: string
          target_roles?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          id?: string
          target_roles?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "midday_report_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      midday_reports: {
        Row: {
          blockers: string | null
          connects_count: number | null
          created_at: string
          date: string
          dials_count: number | null
          id: string
          meetings_booked: number | null
          mood: string | null
          off_track_reason: string | null
          on_track: string | null
          on_track_action: string | null
          start_of_day_id: string | null
          submitted_at: string
          submitted_at_uk: string | null
          talk_time_minutes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          blockers?: string | null
          connects_count?: number | null
          created_at?: string
          date?: string
          dials_count?: number | null
          id?: string
          meetings_booked?: number | null
          mood?: string | null
          off_track_reason?: string | null
          on_track?: string | null
          on_track_action?: string | null
          start_of_day_id?: string | null
          submitted_at?: string
          submitted_at_uk?: string | null
          talk_time_minutes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          blockers?: string | null
          connects_count?: number | null
          created_at?: string
          date?: string
          dials_count?: number | null
          id?: string
          meetings_booked?: number | null
          mood?: string | null
          off_track_reason?: string | null
          on_track?: string | null
          on_track_action?: string | null
          start_of_day_id?: string | null
          submitted_at?: string
          submitted_at_uk?: string | null
          talk_time_minutes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "midday_reports_start_of_day_id_fkey"
            columns: ["start_of_day_id"]
            isOneToOne: false
            referencedRelation: "start_of_day_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "midday_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      morning_team_goals: {
        Row: {
          created_at: string
          created_by: string | null
          department: string
          goal_type: string
          id: string
          period_end: string
          period_start: string
          target_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department: string
          goal_type: string
          id?: string
          period_end: string
          period_start: string
          target_value?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string
          goal_type?: string
          id?: string
          period_end?: string
          period_start?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          category: Database["public"]["Enums"]["notification_category"]
          created_at: string | null
          id: string
          is_read: boolean | null
          link_url: string | null
          message: string
          recipient_id: string | null
          recipient_role: Database["public"]["Enums"]["app_role"]
          title: string
          triggered_by: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["notification_category"]
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link_url?: string | null
          message: string
          recipient_id?: string | null
          recipient_role: Database["public"]["Enums"]["app_role"]
          title: string
          triggered_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link_url?: string | null
          message?: string
          recipient_id?: string | null
          recipient_role?: Database["public"]["Enums"]["app_role"]
          title?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      objection_reports: {
        Row: {
          created_at: string
          frequency: number
          id: string
          objection_text: string
          report_date: string
          setter_id: string
        }
        Insert: {
          created_at?: string
          frequency?: number
          id?: string
          objection_text: string
          report_date?: string
          setter_id: string
        }
        Update: {
          created_at?: string
          frequency?: number
          id?: string
          objection_text?: string
          report_date?: string
          setter_id?: string
        }
        Relationships: []
      }
      onboarding_flow_settings: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          finish_thumbnail_path: string | null
          finish_video_path: string | null
          finish_video_url: string | null
          id: number
          pre_start_end_body: string
          pre_start_end_title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          finish_thumbnail_path?: string | null
          finish_video_path?: string | null
          finish_video_url?: string | null
          id?: number
          pre_start_end_body?: string
          pre_start_end_title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          finish_thumbnail_path?: string | null
          finish_video_path?: string | null
          finish_video_url?: string | null
          id?: number
          pre_start_end_body?: string
          pre_start_end_title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      onboarding_step_templates: {
        Row: {
          created_at: string
          description: string | null
          document_path: string | null
          done_label: string | null
          enabled: boolean
          id: string
          intro_video_path: string | null
          intro_video_url: string | null
          label: string
          link_url: string | null
          phase: string
          question_prompt: string | null
          quiz: Json | null
          sort_order: number
          step_key: string
          step_type: string
          thumbnail_path: string | null
          updated_at: string
          video_path: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_path?: string | null
          done_label?: string | null
          enabled?: boolean
          id?: string
          intro_video_path?: string | null
          intro_video_url?: string | null
          label: string
          link_url?: string | null
          phase: string
          question_prompt?: string | null
          quiz?: Json | null
          sort_order?: number
          step_key: string
          step_type?: string
          thumbnail_path?: string | null
          updated_at?: string
          video_path?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          document_path?: string | null
          done_label?: string | null
          enabled?: boolean
          id?: string
          intro_video_path?: string | null
          intro_video_url?: string | null
          label?: string
          link_url?: string | null
          phase?: string
          question_prompt?: string | null
          quiz?: Json | null
          sort_order?: number
          step_key?: string
          step_type?: string
          thumbnail_path?: string | null
          updated_at?: string
          video_path?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      onboarding_webhook_audit_log: {
        Row: {
          created_at: string
          event_type: string | null
          id: string
          message: string | null
          onboarding_id: string | null
          request_payload: Json | null
          response_payload: Json | null
          source: string | null
          source_key: string | null
          status: string
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          id?: string
          message?: string | null
          onboarding_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          source?: string | null
          source_key?: string | null
          status: string
        }
        Update: {
          created_at?: string
          event_type?: string | null
          id?: string
          message?: string | null
          onboarding_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          source?: string | null
          source_key?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_webhook_audit_log_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "client_onboarding_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_costs: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          end_date: string | null
          frequency: string
          id: string
          name: string
          notes: string | null
          start_date: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          name: string
          notes?: string | null
          start_date?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          name?: string
          notes?: string | null
          start_date?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      pace_curves: {
        Row: {
          created_at: string
          department: string
          id: string
          period: string
          updated_at: string
          updated_by: string | null
          weights: Json
        }
        Insert: {
          created_at?: string
          department: string
          id?: string
          period?: string
          updated_at?: string
          updated_by?: string | null
          weights: Json
        }
        Update: {
          created_at?: string
          department?: string
          id?: string
          period?: string
          updated_at?: string
          updated_by?: string | null
          weights?: Json
        }
        Relationships: []
      }
      partial_payments: {
        Row: {
          accounting_record_id: string
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method:
            | Database["public"]["Enums"]["payment_method_type"]
            | null
          proof_url: string | null
        }
        Insert: {
          accounting_record_id: string
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date: string
          payment_method?:
            | Database["public"]["Enums"]["payment_method_type"]
            | null
          proof_url?: string | null
        }
        Update: {
          accounting_record_id?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?:
            | Database["public"]["Enums"]["payment_method_type"]
            | null
          proof_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partial_payments_accounting_record_id_fkey"
            columns: ["accounting_record_id"]
            isOneToOne: false
            referencedRelation: "accounting_records"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_documents: {
        Row: {
          doc_type: string
          file_name: string
          file_url: string
          id: string
          partner_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          doc_type?: string
          file_name: string
          file_url: string
          id?: string
          partner_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          doc_type?: string
          file_name?: string
          file_url?: string
          id?: string
          partner_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_references: {
        Row: {
          closed_notified_at: string | null
          company_name: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          fee_amount: number
          fee_paid_at: string | null
          fee_status: string
          id: string
          linkedin_url: string | null
          meeting_id: string | null
          mobile: string | null
          note: string | null
          pain_points: string | null
          partner_id: string
          partner_notified_at: string | null
          requested_by: string | null
          sector: string | null
          status: string
          updated_at: string
        }
        Insert: {
          closed_notified_at?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          fee_amount?: number
          fee_paid_at?: string | null
          fee_status?: string
          id?: string
          linkedin_url?: string | null
          meeting_id?: string | null
          mobile?: string | null
          note?: string | null
          pain_points?: string | null
          partner_id: string
          partner_notified_at?: string | null
          requested_by?: string | null
          sector?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          closed_notified_at?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          fee_amount?: number
          fee_paid_at?: string | null
          fee_status?: string
          id?: string
          linkedin_url?: string | null
          meeting_id?: string | null
          mobile?: string | null
          note?: string | null
          pain_points?: string | null
          partner_id?: string
          partner_notified_at?: string | null
          requested_by?: string | null
          sector?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_references_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_references_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_details_updated_at: string | null
          bank_sort_code: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          user_id: string
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_details_updated_at?: string | null
          bank_sort_code?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          id?: string
          user_id: string
        }
        Update: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_details_updated_at?: string | null
          bank_sort_code?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_history: {
        Row: {
          accounting_record_id: string
          action: string
          admin_user_id: string | null
          amount: number | null
          created_at: string
          id: string
          notes: string | null
        }
        Insert: {
          accounting_record_id: string
          action: string
          admin_user_id?: string | null
          amount?: number | null
          created_at?: string
          id?: string
          notes?: string | null
        }
        Update: {
          accounting_record_id?: string
          action?: string
          admin_user_id?: string | null
          amount?: number | null
          created_at?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_accounting_record_id_fkey"
            columns: ["accounting_record_id"]
            isOneToOne: false
            referencedRelation: "accounting_records"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_installments: {
        Row: {
          accounting_record_id: string
          amount: number
          created_at: string | null
          deferral_end_date: string | null
          deferral_reason: string | null
          due_date: string
          id: string
          installment_number: number
          is_deferred: boolean | null
          notes: string | null
          paid_amount: number | null
          paid_date: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          accounting_record_id: string
          amount: number
          created_at?: string | null
          deferral_end_date?: string | null
          deferral_reason?: string | null
          due_date: string
          id?: string
          installment_number: number
          is_deferred?: boolean | null
          notes?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          accounting_record_id?: string
          amount?: number
          created_at?: string | null
          deferral_end_date?: string | null
          deferral_reason?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          is_deferred?: boolean | null
          notes?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_installments_accounting_record_id_fkey"
            columns: ["accounting_record_id"]
            isOneToOne: false
            referencedRelation: "accounting_records"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_cycles: {
        Row: {
          closed_at: string
          closed_by: string
          created_at: string
          department: string
          grand_total_by_currency: Json | null
          id: string
          period_end: string
          period_start: string
          setter_count: number | null
        }
        Insert: {
          closed_at?: string
          closed_by: string
          created_at?: string
          department?: string
          grand_total_by_currency?: Json | null
          id?: string
          period_end: string
          period_start: string
          setter_count?: number | null
        }
        Update: {
          closed_at?: string
          closed_by?: string
          created_at?: string
          department?: string
          grand_total_by_currency?: Json | null
          id?: string
          period_end?: string
          period_start?: string
          setter_count?: number | null
        }
        Relationships: []
      }
      pending_badge_proposals: {
        Row: {
          achievement_key: string
          created_at: string | null
          criteria_met: Json | null
          email: string
          id: string
          proposed_at: string | null
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          achievement_key: string
          created_at?: string | null
          criteria_met?: Json | null
          email: string
          id?: string
          proposed_at?: string | null
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          achievement_key?: string
          created_at?: string | null
          criteria_met?: Json | null
          email?: string
          id?: string
          proposed_at?: string | null
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: []
      }
      performance: {
        Row: {
          call_duration_seconds: number | null
          conversations: number | null
          conversion_rate: number | null
          created_at: string
          date: string
          dials_made: number | null
          dials_target: number | null
          email: string | null
          id: string
          leaderboard_rank: number | null
          meetings_booked: number | null
          meetings_target: number | null
          opps_created: number | null
          sat_meetings: number | null
          setter_id: string
          talk_time: number | null
          updated_at: string
          user_id: string | null
          warm_leads: number | null
        }
        Insert: {
          call_duration_seconds?: number | null
          conversations?: number | null
          conversion_rate?: number | null
          created_at?: string
          date?: string
          dials_made?: number | null
          dials_target?: number | null
          email?: string | null
          id?: string
          leaderboard_rank?: number | null
          meetings_booked?: number | null
          meetings_target?: number | null
          opps_created?: number | null
          sat_meetings?: number | null
          setter_id: string
          talk_time?: number | null
          updated_at?: string
          user_id?: string | null
          warm_leads?: number | null
        }
        Update: {
          call_duration_seconds?: number | null
          conversations?: number | null
          conversion_rate?: number | null
          created_at?: string
          date?: string
          dials_made?: number | null
          dials_target?: number | null
          email?: string | null
          id?: string
          leaderboard_rank?: number | null
          meetings_booked?: number | null
          meetings_target?: number | null
          opps_created?: number | null
          sat_meetings?: number | null
          setter_id?: string
          talk_time?: number | null
          updated_at?: string
          user_id?: string | null
          warm_leads?: number | null
        }
        Relationships: []
      }
      performance_goals: {
        Row: {
          created_at: string
          id: string
          metric: string
          month: string
          monthly_target: number
          role_type: string
          set_by: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metric: string
          month: string
          monthly_target: number
          role_type: string
          set_by: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metric?: string
          month?: string
          monthly_target?: number
          role_type?: string
          set_by?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      performance_history: {
        Row: {
          conversations: number | null
          conversion_rate: number | null
          created_at: string
          date: string
          dials_made: number | null
          dials_target: number | null
          email: string
          id: string
          leaderboard_rank: number | null
          meetings_booked: number | null
          meetings_target: number | null
          sat_meetings: number | null
          setter_id: string
          talk_time: number | null
          updated_at: string
          user_id: string
          warm_leads: number | null
        }
        Insert: {
          conversations?: number | null
          conversion_rate?: number | null
          created_at?: string
          date: string
          dials_made?: number | null
          dials_target?: number | null
          email: string
          id?: string
          leaderboard_rank?: number | null
          meetings_booked?: number | null
          meetings_target?: number | null
          sat_meetings?: number | null
          setter_id: string
          talk_time?: number | null
          updated_at?: string
          user_id: string
          warm_leads?: number | null
        }
        Update: {
          conversations?: number | null
          conversion_rate?: number | null
          created_at?: string
          date?: string
          dials_made?: number | null
          dials_target?: number | null
          email?: string
          id?: string
          leaderboard_rank?: number | null
          meetings_booked?: number | null
          meetings_target?: number | null
          sat_meetings?: number | null
          setter_id?: string
          talk_time?: number | null
          updated_at?: string
          user_id?: string
          warm_leads?: number | null
        }
        Relationships: []
      }
      performance_review_briefs: {
        Row: {
          brief: Json | null
          created_at: string
          error: string | null
          id: string
          model: string | null
          review_id: string
          status: string
          updated_at: string
        }
        Insert: {
          brief?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          model?: string | null
          review_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          brief?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          model?: string | null
          review_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_review_briefs_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          compiled_metrics: Json
          created_at: string
          created_by: string
          department: string | null
          id: string
          period_end: string
          period_start: string
          reviewee_user_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          compiled_metrics?: Json
          created_at?: string
          created_by: string
          department?: string | null
          id?: string
          period_end: string
          period_start: string
          reviewee_user_id: string
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          compiled_metrics?: Json
          created_at?: string
          created_by?: string
          department?: string | null
          id?: string
          period_end?: string
          period_start?: string
          reviewee_user_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pip_progress_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string
          pip_record_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          pip_record_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          pip_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pip_progress_notes_pip_record_id_fkey"
            columns: ["pip_record_id"]
            isOneToOne: false
            referencedRelation: "pip_records"
            referencedColumns: ["id"]
          },
        ]
      }
      pip_records: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string | null
          id: string
          outcome: string | null
          reason: string
          setter_profile_id: string
          start_date: string
          started_by: string | null
          status: string
          target_metrics: Json | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          outcome?: string | null
          reason: string
          setter_profile_id: string
          start_date?: string
          started_by?: string | null
          status?: string
          target_metrics?: Json | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          outcome?: string | null
          reason?: string
          setter_profile_id?: string
          start_date?: string
          started_by?: string | null
          status?: string
          target_metrics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pip_records_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pip_records_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_calls: {
        Row: {
          cash_collected: number | null
          cash_collected_ex_vat: number | null
          client_email: string
          client_name: string
          client_profile_id: string | null
          closed_on: string | null
          company_name: string | null
          contract_term: string | null
          contract_value: number | null
          converted_to_client: boolean | null
          created_at: string
          created_by: string | null
          discovery_log_id: string | null
          fathom_url: string | null
          has_feedback: boolean | null
          id: string
          is_pif: boolean | null
          marked_not_proceeding: boolean | null
          notes: string | null
          original_interest: string | null
          original_outcome: string | null
          pif_amount: number | null
          pitch_call_date: string
          pitch_call_time: string | null
          pitch_interest: string | null
          pitch_outcome: string | null
          special_agreements: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          cash_collected?: number | null
          cash_collected_ex_vat?: number | null
          client_email: string
          client_name: string
          client_profile_id?: string | null
          closed_on?: string | null
          company_name?: string | null
          contract_term?: string | null
          contract_value?: number | null
          converted_to_client?: boolean | null
          created_at?: string
          created_by?: string | null
          discovery_log_id?: string | null
          fathom_url?: string | null
          has_feedback?: boolean | null
          id?: string
          is_pif?: boolean | null
          marked_not_proceeding?: boolean | null
          notes?: string | null
          original_interest?: string | null
          original_outcome?: string | null
          pif_amount?: number | null
          pitch_call_date: string
          pitch_call_time?: string | null
          pitch_interest?: string | null
          pitch_outcome?: string | null
          special_agreements?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          cash_collected?: number | null
          cash_collected_ex_vat?: number | null
          client_email?: string
          client_name?: string
          client_profile_id?: string | null
          closed_on?: string | null
          company_name?: string | null
          contract_term?: string | null
          contract_value?: number | null
          converted_to_client?: boolean | null
          created_at?: string
          created_by?: string | null
          discovery_log_id?: string | null
          fathom_url?: string | null
          has_feedback?: boolean | null
          id?: string
          is_pif?: boolean | null
          marked_not_proceeding?: boolean | null
          notes?: string | null
          original_interest?: string | null
          original_outcome?: string | null
          pif_amount?: number | null
          pitch_call_date?: string
          pitch_call_time?: string | null
          pitch_interest?: string | null
          pitch_outcome?: string | null
          special_agreements?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_calls_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_calls_discovery_log_id_fkey"
            columns: ["discovery_log_id"]
            isOneToOne: false
            referencedRelation: "sales_discovery_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      post_discovery_feedback: {
        Row: {
          admin_commentary: string | null
          admin_rating: number | null
          ae_user_id: string
          ae_what_to_improve: string
          ae_what_went_well: string
          budget_confidence_score: number
          call_date: string
          call_recording_link: string
          call_type: string
          client_name: string
          coaching_action_items: string | null
          created_at: string
          decision_maker_access_score: number
          decision_process: string
          desired_outcome: string
          discovery_log_id: string
          icp_fit_score: number
          id: string
          key_pain_points: string
          next_steps_agreed: string
          objections_raised: string
          pain_severity_score: number
          reviewed_at: string | null
          reviewed_by: string | null
          risks_to_close: string
          status: string
          summary: string
          support_needed_from_ceo: string
          updated_at: string
          urgency_score: number
        }
        Insert: {
          admin_commentary?: string | null
          admin_rating?: number | null
          ae_user_id: string
          ae_what_to_improve: string
          ae_what_went_well: string
          budget_confidence_score: number
          call_date: string
          call_recording_link: string
          call_type: string
          client_name: string
          coaching_action_items?: string | null
          created_at?: string
          decision_maker_access_score: number
          decision_process: string
          desired_outcome: string
          discovery_log_id: string
          icp_fit_score: number
          id?: string
          key_pain_points: string
          next_steps_agreed: string
          objections_raised: string
          pain_severity_score: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          risks_to_close: string
          status?: string
          summary: string
          support_needed_from_ceo: string
          updated_at?: string
          urgency_score: number
        }
        Update: {
          admin_commentary?: string | null
          admin_rating?: number | null
          ae_user_id?: string
          ae_what_to_improve?: string
          ae_what_went_well?: string
          budget_confidence_score?: number
          call_date?: string
          call_recording_link?: string
          call_type?: string
          client_name?: string
          coaching_action_items?: string | null
          created_at?: string
          decision_maker_access_score?: number
          decision_process?: string
          desired_outcome?: string
          discovery_log_id?: string
          icp_fit_score?: number
          id?: string
          key_pain_points?: string
          next_steps_agreed?: string
          objections_raised?: string
          pain_severity_score?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          risks_to_close?: string
          status?: string
          summary?: string
          support_needed_from_ceo?: string
          updated_at?: string
          urgency_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_discovery_feedback_discovery_log_id_fkey"
            columns: ["discovery_log_id"]
            isOneToOne: false
            referencedRelation: "sales_discovery_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      post_pitch_call_feedback: {
        Row: {
          admin_commentary: string | null
          admin_rating: number | null
          ae_user_id: string
          ae_what_to_improve: string
          ae_what_went_well: string
          blockers_to_close: string
          call_date: string
          call_recording_link: string
          client_name: string
          closing_confidence_score: number
          coaching_action_items: string | null
          company_name: string | null
          competitor_awareness_score: number
          competitor_mentions: string
          created_at: string
          decision_timeline_score: number
          id: string
          next_steps_agreed: string
          objection_handling_score: number
          objections_handled: string
          objections_raised: string
          pitch_call_id: string
          pricing_discussion: string
          proposal_clarity_score: number
          proposal_presented: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          summary: string
          support_needed: string
          updated_at: string
        }
        Insert: {
          admin_commentary?: string | null
          admin_rating?: number | null
          ae_user_id: string
          ae_what_to_improve?: string
          ae_what_went_well?: string
          blockers_to_close?: string
          call_date: string
          call_recording_link: string
          client_name: string
          closing_confidence_score?: number
          coaching_action_items?: string | null
          company_name?: string | null
          competitor_awareness_score?: number
          competitor_mentions?: string
          created_at?: string
          decision_timeline_score?: number
          id?: string
          next_steps_agreed?: string
          objection_handling_score?: number
          objections_handled?: string
          objections_raised?: string
          pitch_call_id: string
          pricing_discussion?: string
          proposal_clarity_score?: number
          proposal_presented?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary?: string
          support_needed?: string
          updated_at?: string
        }
        Update: {
          admin_commentary?: string | null
          admin_rating?: number | null
          ae_user_id?: string
          ae_what_to_improve?: string
          ae_what_went_well?: string
          blockers_to_close?: string
          call_date?: string
          call_recording_link?: string
          client_name?: string
          closing_confidence_score?: number
          coaching_action_items?: string | null
          company_name?: string | null
          competitor_awareness_score?: number
          competitor_mentions?: string
          created_at?: string
          decision_timeline_score?: number
          id?: string
          next_steps_agreed?: string
          objection_handling_score?: number
          objections_handled?: string
          objections_raised?: string
          pitch_call_id?: string
          pricing_discussion?: string
          proposal_clarity_score?: number
          proposal_presented?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary?: string
          support_needed?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_pitch_call_feedback_pitch_call_id_fkey"
            columns: ["pitch_call_id"]
            isOneToOne: false
            referencedRelation: "pitch_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_disco_research: {
        Row: {
          company_name: string | null
          company_website: string
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          meeting_id: string | null
          research_json: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          company_website: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          meeting_id?: string | null
          research_json?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          company_website?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          meeting_id?: string | null
          research_json?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          base_salary: number | null
          birthday: string | null
          company_name: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          in_onboarding_mode: boolean
          in_trial_mode: boolean
          job_title: string | null
          leave_allowance_days: number | null
          must_change_password: boolean
          offboarded_at: string | null
          phone: string | null
          start_date: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          base_salary?: number | null
          birthday?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          in_onboarding_mode?: boolean
          in_trial_mode?: boolean
          job_title?: string | null
          leave_allowance_days?: number | null
          must_change_password?: boolean
          offboarded_at?: string | null
          phone?: string | null
          start_date?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          base_salary?: number | null
          birthday?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          in_onboarding_mode?: boolean
          in_trial_mode?: boolean
          job_title?: string | null
          leave_allowance_days?: number | null
          must_change_password?: boolean
          offboarded_at?: string | null
          phone?: string | null
          start_date?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          added_at: string
          added_by: string | null
          is_lead: boolean
          project_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          is_lead?: boolean
          project_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          is_lead?: boolean
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_updates: {
        Row: {
          author_id: string | null
          blocker_text: string | null
          created_at: string
          done_text: string | null
          id: string
          project_id: string
          remaining_text: string | null
          update_date: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          blocker_text?: string | null
          created_at?: string
          done_text?: string | null
          id?: string
          project_id: string
          remaining_text?: string | null
          update_date?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          blocker_text?: string | null
          created_at?: string
          done_text?: string | null
          id?: string
          project_id?: string
          remaining_text?: string | null
          update_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          id: string
          position: number
          progress_pct: number | null
          status: string
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          position?: number
          progress_pct?: number | null
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          position?: number
          progress_pct?: number | null
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      qualification_criteria: {
        Row: {
          created_at: string
          enabled: boolean
          expected_boolean: boolean | null
          expected_text: string | null
          framework: string
          gate_type: string
          id: string
          label: string
          operator: string | null
          question_key: string
          rationale: string | null
          sort_order: number
          threshold_numeric: number | null
          threshold_numeric_max: number | null
          updated_at: string
          updated_by: string | null
          weight: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          expected_boolean?: boolean | null
          expected_text?: string | null
          framework?: string
          gate_type?: string
          id?: string
          label: string
          operator?: string | null
          question_key: string
          rationale?: string | null
          sort_order?: number
          threshold_numeric?: number | null
          threshold_numeric_max?: number | null
          updated_at?: string
          updated_by?: string | null
          weight?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          expected_boolean?: boolean | null
          expected_text?: string | null
          framework?: string
          gate_type?: string
          id?: string
          label?: string
          operator?: string | null
          question_key?: string
          rationale?: string | null
          sort_order?: number
          threshold_numeric?: number | null
          threshold_numeric_max?: number | null
          updated_at?: string
          updated_by?: string | null
          weight?: number
        }
        Relationships: []
      }
      recognition_awards: {
        Row: {
          assigned_by: string | null
          award_title: string
          badge_type: string
          created_at: string | null
          date_awarded: string
          id: string
          notes: string | null
          recipient_email: string
          recipient_name: string
          updated_at: string | null
        }
        Insert: {
          assigned_by?: string | null
          award_title: string
          badge_type: string
          created_at?: string | null
          date_awarded?: string
          id?: string
          notes?: string | null
          recipient_email: string
          recipient_name: string
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string | null
          award_title?: string
          badge_type?: string
          created_at?: string | null
          date_awarded?: string
          id?: string
          notes?: string | null
          recipient_email?: string
          recipient_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          contact_email: string | null
          contact_full_name: string
          contact_mobile: string | null
          converted_at: string | null
          converted_by: string | null
          created_at: string
          date_referred: string
          discovery_id: string | null
          id: string
          partner_id: string
          payout_amount: number | null
          payout_date: string | null
          payout_status: string
          referred_company_name: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_full_name: string
          contact_mobile?: string | null
          converted_at?: string | null
          converted_by?: string | null
          created_at?: string
          date_referred?: string
          discovery_id?: string | null
          id?: string
          partner_id: string
          payout_amount?: number | null
          payout_date?: string | null
          payout_status?: string
          referred_company_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_full_name?: string
          contact_mobile?: string | null
          converted_at?: string | null
          converted_by?: string | null
          created_at?: string
          date_referred?: string
          discovery_id?: string | null
          id?: string
          partner_id?: string
          payout_amount?: number | null
          payout_date?: string | null
          payout_status?: string
          referred_company_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_discovery_id_fkey"
            columns: ["discovery_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_manual_fields: {
        Row: {
          client_profile_id: string
          created_at: string
          edited_at: string
          edited_by: string
          field: string
          id: string
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          client_profile_id: string
          created_at?: string
          edited_at?: string
          edited_by: string
          field: string
          id?: string
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          client_profile_id?: string
          created_at?: string
          edited_at?: string
          edited_by?: string
          field?: string
          id?: string
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renewal_manual_fields_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_presentations: {
        Row: {
          client_profile_id: string
          figures: Json
          id: string
          presented_at: string
          presented_by: string
          scenario: string
        }
        Insert: {
          client_profile_id: string
          figures: Json
          id?: string
          presented_at?: string
          presented_by: string
          scenario: string
        }
        Update: {
          client_profile_id?: string
          figures?: Json
          id?: string
          presented_at?: string
          presented_by?: string
          scenario?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_presentations_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          category: string
          created_at: string
          description: string | null
          file_name: string | null
          file_path: string | null
          id: string
          title: string
          updated_at: string
          url: string
          visible_to_clients: boolean | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          title: string
          updated_at?: string
          url: string
          visible_to_clients?: boolean | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          title?: string
          updated_at?: string
          url?: string
          visible_to_clients?: boolean | null
        }
        Relationships: []
      }
      responsibility_checkins: {
        Row: {
          checked_at: string
          id: string
          note: string | null
          task_instance_id: string
          user_id: string
        }
        Insert: {
          checked_at?: string
          id?: string
          note?: string | null
          task_instance_id: string
          user_id: string
        }
        Update: {
          checked_at?: string
          id?: string
          note?: string | null
          task_instance_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "responsibility_checkins_task_instance_id_fkey"
            columns: ["task_instance_id"]
            isOneToOne: false
            referencedRelation: "task_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      role_capabilities: {
        Row: {
          capability: string
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          capability: string
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          capability?: string
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      role_target_defaults: {
        Row: {
          created_at: string
          department: string
          id: string
          metric: string
          period: string
          role: string
          target_value: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          department?: string
          id?: string
          metric: string
          period: string
          role: string
          target_value: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          department?: string
          id?: string
          metric?: string
          period?: string
          role?: string
          target_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      roster_clients: {
        Row: {
          client_profile_id: string
          created_at: string
          id: string
          manager_user_id: string
          sort_order: number | null
        }
        Insert: {
          client_profile_id: string
          created_at?: string
          id?: string
          manager_user_id: string
          sort_order?: number | null
        }
        Update: {
          client_profile_id?: string
          created_at?: string
          id?: string
          manager_user_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_clients_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_entries: {
        Row: {
          assigned_by: string | null
          client_profile_id: string
          created_at: string
          id: string
          roster_date: string
          setter_profile_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          client_profile_id: string
          created_at?: string
          id?: string
          roster_date: string
          setter_profile_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          client_profile_id?: string
          created_at?: string
          id?: string
          roster_date?: string
          setter_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_entries_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_discovery_logs: {
        Row: {
          attendance_confirmed: boolean | null
          cash_collected_ex_vat: number | null
          client_email: string
          client_interest: string | null
          client_name: string
          client_profile_id: string | null
          contract_term: string | null
          contract_value: number | null
          converted_to_client: boolean | null
          created_at: string
          fathom_url: string | null
          follow_up_count: number | null
          follow_up_date: string | null
          id: string
          is_pipeline_reengagement: boolean
          marked_not_proceeding: boolean | null
          meeting_at: string
          meeting_id: string | null
          notes: string | null
          outcome: string | null
          sent_contract_at: string | null
          team_network_member: boolean | null
          updated_at: string
        }
        Insert: {
          attendance_confirmed?: boolean | null
          cash_collected_ex_vat?: number | null
          client_email: string
          client_interest?: string | null
          client_name: string
          client_profile_id?: string | null
          contract_term?: string | null
          contract_value?: number | null
          converted_to_client?: boolean | null
          created_at?: string
          fathom_url?: string | null
          follow_up_count?: number | null
          follow_up_date?: string | null
          id?: string
          is_pipeline_reengagement?: boolean
          marked_not_proceeding?: boolean | null
          meeting_at: string
          meeting_id?: string | null
          notes?: string | null
          outcome?: string | null
          sent_contract_at?: string | null
          team_network_member?: boolean | null
          updated_at?: string
        }
        Update: {
          attendance_confirmed?: boolean | null
          cash_collected_ex_vat?: number | null
          client_email?: string
          client_interest?: string | null
          client_name?: string
          client_profile_id?: string | null
          contract_term?: string | null
          contract_value?: number | null
          converted_to_client?: boolean | null
          created_at?: string
          fathom_url?: string | null
          follow_up_count?: number | null
          follow_up_date?: string | null
          id?: string
          is_pipeline_reengagement?: boolean
          marked_not_proceeding?: boolean | null
          meeting_at?: string
          meeting_id?: string | null
          notes?: string | null
          outcome?: string | null
          sent_contract_at?: string | null
          team_network_member?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_discovery_logs_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_discovery_logs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      sdr_daily_metrics: {
        Row: {
          campaign_id: string | null
          client_id: string | null
          connects: number | null
          conversations: number | null
          created_at: string | null
          date: string
          dials: number | null
          id: string
          meetings: number | null
          showups: number | null
          talk_time_minutes: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          client_id?: string | null
          connects?: number | null
          conversations?: number | null
          created_at?: string | null
          date: string
          dials?: number | null
          id?: string
          meetings?: number | null
          showups?: number | null
          talk_time_minutes?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          client_id?: string | null
          connects?: number | null
          conversations?: number | null
          created_at?: string | null
          date?: string
          dials?: number | null
          id?: string
          meetings?: number | null
          showups?: number | null
          talk_time_minutes?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sdr_manager_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          department: string | null
          id: string
          manager_user_id: string
          setter_profile_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          department?: string | null
          id?: string
          manager_user_id: string
          setter_profile_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          department?: string | null
          id?: string
          manager_user_id?: string
          setter_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sdr_manager_assignments_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_manager_assignments_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      setter_client_assignments: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          duration_days: number
          ends_at: string
          id: string
          lead_list_id: string | null
          meeting_target: number
          meetings_completed: number
          setter_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_days?: number
          ends_at: string
          id?: string
          lead_list_id?: string | null
          meeting_target?: number
          meetings_completed?: number
          setter_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_days?: number
          ends_at?: string
          id?: string
          lead_list_id?: string | null
          meeting_target?: number
          meetings_completed?: number
          setter_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setter_client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setter_client_assignments_lead_list_id_fkey"
            columns: ["lead_list_id"]
            isOneToOne: false
            referencedRelation: "client_lead_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setter_client_assignments_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setter_client_assignments_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      setter_close_metrics: {
        Row: {
          close_user_id: string
          connect_rate: number
          connects: number
          connects_3_plus_mins: number
          created_at: string
          date: string
          department: string | null
          dials: number
          id: string
          setter_name: string | null
          talk_time_seconds: number
          updated_at: string
        }
        Insert: {
          close_user_id: string
          connect_rate?: number
          connects?: number
          connects_3_plus_mins?: number
          created_at?: string
          date: string
          department?: string | null
          dials?: number
          id?: string
          setter_name?: string | null
          talk_time_seconds?: number
          updated_at?: string
        }
        Update: {
          close_user_id?: string
          connect_rate?: number
          connects?: number
          connects_3_plus_mins?: number
          created_at?: string
          date?: string
          department?: string | null
          dials?: number
          id?: string
          setter_name?: string | null
          talk_time_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      setter_feedback: {
        Row: {
          anything_else: string | null
          calls_reviewed: number | null
          challenges: string | null
          created_at: string
          date: string
          email: string | null
          emails_sent_today: number | null
          hit_goal: boolean | null
          hit_goal_note: string | null
          id: string
          meetings_booked_today: number | null
          mood: string
          notes: string | null
          objections_struggled: string | null
          role: string | null
          setter_id: string
          submitted_at_uk: string | null
          training_needed: string | null
          updated_at: string
          what_went_well: string | null
          what_you_did: string | null
          what_you_struggled_with: string | null
        }
        Insert: {
          anything_else?: string | null
          calls_reviewed?: number | null
          challenges?: string | null
          created_at?: string
          date?: string
          email?: string | null
          emails_sent_today?: number | null
          hit_goal?: boolean | null
          hit_goal_note?: string | null
          id?: string
          meetings_booked_today?: number | null
          mood: string
          notes?: string | null
          objections_struggled?: string | null
          role?: string | null
          setter_id: string
          submitted_at_uk?: string | null
          training_needed?: string | null
          updated_at?: string
          what_went_well?: string | null
          what_you_did?: string | null
          what_you_struggled_with?: string | null
        }
        Update: {
          anything_else?: string | null
          calls_reviewed?: number | null
          challenges?: string | null
          created_at?: string
          date?: string
          email?: string | null
          emails_sent_today?: number | null
          hit_goal?: boolean | null
          hit_goal_note?: string | null
          id?: string
          meetings_booked_today?: number | null
          mood?: string
          notes?: string | null
          objections_struggled?: string | null
          role?: string | null
          setter_id?: string
          submitted_at_uk?: string | null
          training_needed?: string | null
          updated_at?: string
          what_went_well?: string | null
          what_you_did?: string | null
          what_you_struggled_with?: string | null
        }
        Relationships: []
      }
      setter_onboarding_checklist: {
        Row: {
          created_at: string
          date: string
          id: string
          listened_to_calls: boolean | null
          manager_feedback: string | null
          manager_user_id: string | null
          onboarding_day: number
          roleplay_passed: boolean | null
          script_review_completed: boolean | null
          setter_profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          listened_to_calls?: boolean | null
          manager_feedback?: string | null
          manager_user_id?: string | null
          onboarding_day: number
          roleplay_passed?: boolean | null
          script_review_completed?: boolean | null
          setter_profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          listened_to_calls?: boolean | null
          manager_feedback?: string | null
          manager_user_id?: string | null
          onboarding_day?: number
          roleplay_passed?: boolean | null
          script_review_completed?: boolean | null
          setter_profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setter_onboarding_checklist_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setter_onboarding_checklist_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      setter_period_notes: {
        Row: {
          author_user_id: string
          created_at: string
          id: string
          note: string
          period_month: string
          setter_profile_id: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          id?: string
          note?: string
          period_month: string
          setter_profile_id: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          id?: string
          note?: string
          period_month?: string
          setter_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setter_period_notes_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setter_period_notes_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      setter_review_metric_overrides: {
        Row: {
          created_at: string
          id: string
          meetings_booked: number | null
          meetings_sat: number | null
          period_month: string
          reason: string | null
          set_at: string
          set_by: string
          setter_profile_id: string
          updated_at: string
          warm_leads: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          meetings_booked?: number | null
          meetings_sat?: number | null
          period_month: string
          reason?: string | null
          set_at?: string
          set_by: string
          setter_profile_id: string
          updated_at?: string
          warm_leads?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          meetings_booked?: number | null
          meetings_sat?: number | null
          period_month?: string
          reason?: string | null
          set_at?: string
          set_by?: string
          setter_profile_id?: string
          updated_at?: string
          warm_leads?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "setter_review_metric_overrides_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setter_review_metric_overrides_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: false
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      setter_targets: {
        Row: {
          created_at: string
          daily_dials_target: number
          daily_meetings_target: number
          daily_talk_time_target: number
          setter_profile_id: string
          updated_at: string
          updated_by: string | null
          weekly_meetings_target: number
        }
        Insert: {
          created_at?: string
          daily_dials_target?: number
          daily_meetings_target?: number
          daily_talk_time_target?: number
          setter_profile_id: string
          updated_at?: string
          updated_by?: string | null
          weekly_meetings_target?: number
        }
        Update: {
          created_at?: string
          daily_dials_target?: number
          daily_meetings_target?: number
          daily_talk_time_target?: number
          setter_profile_id?: string
          updated_at?: string
          updated_by?: string | null
          weekly_meetings_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "setter_targets_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: true
            referencedRelation: "setters_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setter_targets_setter_profile_id_fkey"
            columns: ["setter_profile_id"]
            isOneToOne: true
            referencedRelation: "setters_profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      setter_useful_links: {
        Row: {
          created_at: string
          created_by: string | null
          department: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      setter_weekly_goals: {
        Row: {
          created_at: string
          created_by: string | null
          goal_metric: string
          id: string
          notes: string | null
          setter_user_id: string
          target_value: number
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          goal_metric: string
          id?: string
          notes?: string | null
          setter_user_id: string
          target_value?: number
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          goal_metric?: string
          id?: string
          notes?: string | null
          setter_user_id?: string
          target_value?: number
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      setters_profiles: {
        Row: {
          account_holder_name: string | null
          account_number: string | null
          active: boolean | null
          bank_address: string | null
          bank_country: string | null
          bank_name: string | null
          base_salary: number | null
          close_user_id: string | null
          commission_earned: number | null
          created_at: string
          currency: string | null
          current_coaching_focus: string | null
          daily_dials_target: number | null
          daily_meetings_target: number | null
          daily_talk_time_target: number | null
          department: string
          email: string
          full_name: string | null
          home_address: string | null
          hourly_form_enabled: boolean
          hourly_form_updated_at: string | null
          hourly_form_updated_by: string | null
          iban: string | null
          id: string
          is_test_account: boolean
          last_coaching_session: string | null
          last_rivalry_ended_at: string | null
          last_rivalry_winner_email: string | null
          meetings_sat: number | null
          notes: string | null
          on_probation: boolean
          per_meeting_bonus: number | null
          probation_start_date: string | null
          ramp_stage: Database["public"]["Enums"]["setter_ramp_stage"] | null
          rival_email: string | null
          rivalry_end_date: string | null
          rivalry_end_pending: boolean | null
          rivalry_reward_amount: number | null
          rivalry_reward_set_by: string | null
          rivalry_reward_type: string | null
          rivalry_started_at: string | null
          sort_code: string | null
          start_date: string | null
          status: string | null
          status_changed_at: string | null
          status_changed_by: string | null
          swift_bic: string | null
          title: string
          updated_at: string
          user_id: string
          weekly_meetings_target: number | null
        }
        Insert: {
          account_holder_name?: string | null
          account_number?: string | null
          active?: boolean | null
          bank_address?: string | null
          bank_country?: string | null
          bank_name?: string | null
          base_salary?: number | null
          close_user_id?: string | null
          commission_earned?: number | null
          created_at?: string
          currency?: string | null
          current_coaching_focus?: string | null
          daily_dials_target?: number | null
          daily_meetings_target?: number | null
          daily_talk_time_target?: number | null
          department?: string
          email: string
          full_name?: string | null
          home_address?: string | null
          hourly_form_enabled?: boolean
          hourly_form_updated_at?: string | null
          hourly_form_updated_by?: string | null
          iban?: string | null
          id?: string
          is_test_account?: boolean
          last_coaching_session?: string | null
          last_rivalry_ended_at?: string | null
          last_rivalry_winner_email?: string | null
          meetings_sat?: number | null
          notes?: string | null
          on_probation?: boolean
          per_meeting_bonus?: number | null
          probation_start_date?: string | null
          ramp_stage?: Database["public"]["Enums"]["setter_ramp_stage"] | null
          rival_email?: string | null
          rivalry_end_date?: string | null
          rivalry_end_pending?: boolean | null
          rivalry_reward_amount?: number | null
          rivalry_reward_set_by?: string | null
          rivalry_reward_type?: string | null
          rivalry_started_at?: string | null
          sort_code?: string | null
          start_date?: string | null
          status?: string | null
          status_changed_at?: string | null
          status_changed_by?: string | null
          swift_bic?: string | null
          title?: string
          updated_at?: string
          user_id: string
          weekly_meetings_target?: number | null
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string | null
          active?: boolean | null
          bank_address?: string | null
          bank_country?: string | null
          bank_name?: string | null
          base_salary?: number | null
          close_user_id?: string | null
          commission_earned?: number | null
          created_at?: string
          currency?: string | null
          current_coaching_focus?: string | null
          daily_dials_target?: number | null
          daily_meetings_target?: number | null
          daily_talk_time_target?: number | null
          department?: string
          email?: string
          full_name?: string | null
          home_address?: string | null
          hourly_form_enabled?: boolean
          hourly_form_updated_at?: string | null
          hourly_form_updated_by?: string | null
          iban?: string | null
          id?: string
          is_test_account?: boolean
          last_coaching_session?: string | null
          last_rivalry_ended_at?: string | null
          last_rivalry_winner_email?: string | null
          meetings_sat?: number | null
          notes?: string | null
          on_probation?: boolean
          per_meeting_bonus?: number | null
          probation_start_date?: string | null
          ramp_stage?: Database["public"]["Enums"]["setter_ramp_stage"] | null
          rival_email?: string | null
          rivalry_end_date?: string | null
          rivalry_end_pending?: boolean | null
          rivalry_reward_amount?: number | null
          rivalry_reward_set_by?: string | null
          rivalry_reward_type?: string | null
          rivalry_started_at?: string | null
          sort_code?: string | null
          start_date?: string | null
          status?: string | null
          status_changed_at?: string | null
          status_changed_by?: string | null
          swift_bic?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          weekly_meetings_target?: number | null
        }
        Relationships: []
      }
      smartlead_reply_actions: {
        Row: {
          action: string | null
          actioned_by: string | null
          created_at: string
          event_id: string | null
          id: string
          sentiment: string | null
        }
        Insert: {
          action?: string | null
          actioned_by?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          sentiment?: string | null
        }
        Update: {
          action?: string | null
          actioned_by?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          sentiment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smartlead_reply_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "gtm_smartlead_events"
            referencedColumns: ["id"]
          },
        ]
      }
      start_of_day_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          popup_time: string
          target_roles: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          popup_time?: string
          target_roles?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          popup_time?: string
          target_roles?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      start_of_day_submissions: {
        Row: {
          anything_else: string | null
          blockers: string | null
          created_at: string
          date: string
          id: string
          missed: boolean
          mood: string | null
          planned_activities: string | null
          submitted_at: string | null
          success_definition: string | null
          top_priorities: string | null
          uk_submitted_at: string | null
          user_id: string
        }
        Insert: {
          anything_else?: string | null
          blockers?: string | null
          created_at?: string
          date?: string
          id?: string
          missed?: boolean
          mood?: string | null
          planned_activities?: string | null
          submitted_at?: string | null
          success_definition?: string | null
          top_priorities?: string | null
          uk_submitted_at?: string | null
          user_id: string
        }
        Update: {
          anything_else?: string | null
          blockers?: string | null
          created_at?: string
          date?: string
          id?: string
          missed?: boolean
          mood?: string | null
          planned_activities?: string | null
          submitted_at?: string | null
          success_definition?: string | null
          top_priorities?: string | null
          uk_submitted_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sync_errors: {
        Row: {
          created_at: string
          error_reason: string
          id: string
          raw_payload: Json | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          source: string
        }
        Insert: {
          created_at?: string
          error_reason: string
          id?: string
          raw_payload?: Json | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          source: string
        }
        Update: {
          created_at?: string
          error_reason?: string
          id?: string
          raw_payload?: Json | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
        }
        Relationships: []
      }
      system_broadcasts: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          message: string
          severity: string
          target_roles: string[]
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          message: string
          severity?: string
          target_roles?: string[]
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          severity?: string
          target_roles?: string[]
          title?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          achievement_data_source: string
          branding_logo_url: string | null
          branding_primary_color: string | null
          company_name: string | null
          created_at: string | null
          csm_calendly_url: string | null
          csm_email: string | null
          csm_name: string | null
          csm_phone: string | null
          default_currency: string | null
          default_timezone: string | null
          email_sender_name: string | null
          id: string
          kit_sequences_enabled: boolean
          maintenance_message: string | null
          maintenance_mode: boolean
          maintenance_restricted_roles: string[]
          pandadoc_paid_automation: boolean
          updated_at: string | null
        }
        Insert: {
          achievement_data_source?: string
          branding_logo_url?: string | null
          branding_primary_color?: string | null
          company_name?: string | null
          created_at?: string | null
          csm_calendly_url?: string | null
          csm_email?: string | null
          csm_name?: string | null
          csm_phone?: string | null
          default_currency?: string | null
          default_timezone?: string | null
          email_sender_name?: string | null
          id?: string
          kit_sequences_enabled?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          maintenance_restricted_roles?: string[]
          pandadoc_paid_automation?: boolean
          updated_at?: string | null
        }
        Update: {
          achievement_data_source?: string
          branding_logo_url?: string | null
          branding_primary_color?: string | null
          company_name?: string | null
          created_at?: string | null
          csm_calendly_url?: string | null
          csm_email?: string | null
          csm_name?: string | null
          csm_phone?: string | null
          default_currency?: string | null
          default_timezone?: string | null
          email_sender_name?: string | null
          id?: string
          kit_sequences_enabled?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          maintenance_restricted_roles?: string[]
          pandadoc_paid_automation?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      task_assignments: {
        Row: {
          active: boolean
          assigned_department: string | null
          assigned_role: Database["public"]["Enums"]["app_role"] | null
          assigned_user_id: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          start_date: string
          template_task_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_department?: string | null
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          start_date?: string
          template_task_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_department?: string | null
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          start_date?: string
          template_task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_instances: {
        Row: {
          assigned_to_user_id: string
          assignment_id: string | null
          auto_completed: boolean
          category: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          due_date: string
          id: string
          link_slot: number | null
          link_type: string | null
          priority: string
          status: string
          template_task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to_user_id: string
          assignment_id?: string | null
          auto_completed?: boolean
          category?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          due_date?: string
          id?: string
          link_slot?: number | null
          link_type?: string | null
          priority?: string
          status?: string
          template_task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string
          assignment_id?: string | null
          auto_completed?: boolean
          category?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          due_date?: string
          id?: string
          link_slot?: number | null
          link_type?: string | null
          priority?: string
          status?: string
          template_task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_instances_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "task_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          active: boolean
          assigned_to_user_id: string | null
          category: string
          created_at: string
          created_by_user_id: string | null
          department: string | null
          description: string | null
          due_at: string | null
          due_time: string | null
          id: string
          is_template: boolean
          link_slot: number | null
          link_type: string | null
          notes: string | null
          priority: string
          project_id: string | null
          recurrence: string
          recurrence_day: number | null
          related_meeting_id: string | null
          status: string
          target_department: string | null
          target_role: Database["public"]["Enums"]["app_role"] | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_to_user_id?: string | null
          category?: string
          created_at?: string
          created_by_user_id?: string | null
          department?: string | null
          description?: string | null
          due_at?: string | null
          due_time?: string | null
          id?: string
          is_template?: boolean
          link_slot?: number | null
          link_type?: string | null
          notes?: string | null
          priority?: string
          project_id?: string | null
          recurrence?: string
          recurrence_day?: number | null
          related_meeting_id?: string | null
          status?: string
          target_department?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_to_user_id?: string | null
          category?: string
          created_at?: string
          created_by_user_id?: string | null
          department?: string | null
          description?: string | null
          due_at?: string | null
          due_time?: string | null
          id?: string
          is_template?: boolean
          link_slot?: number | null
          link_type?: string | null
          notes?: string | null
          priority?: string
          project_id?: string | null
          recurrence?: string
          recurrence_day?: number | null
          related_meeting_id?: string | null
          status?: string
          target_department?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_related_meeting_id_fkey"
            columns: ["related_meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      team_bulletins: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          department: string
          ends_on: string | null
          id: string
          message: string
          starts_on: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          department: string
          ends_on?: string | null
          id?: string
          message: string
          starts_on?: string
          title?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          department?: string
          ends_on?: string | null
          id?: string
          message?: string
          starts_on?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_goals: {
        Row: {
          created_at: string
          created_by: string
          department: string | null
          end_date: string
          goal_metric: string
          id: string
          reward: string
          source: string
          start_date: string
          status: string
          target_meetings: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          department?: string | null
          end_date: string
          goal_metric?: string
          id?: string
          reward: string
          source?: string
          start_date: string
          status?: string
          target_meetings: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          department?: string | null
          end_date?: string
          goal_metric?: string
          id?: string
          reward?: string
          source?: string
          start_date?: string
          status?: string
          target_meetings?: number
          updated_at?: string
        }
        Relationships: []
      }
      teleprompter_scripts: {
        Row: {
          category: string
          content: string
          created_at: string
          font_size: number
          id: string
          is_favorite: boolean
          last_used_at: string | null
          scroll_speed: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          font_size?: number
          id?: string
          is_favorite?: boolean
          last_used_at?: string | null
          scroll_speed?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          font_size?: number
          id?: string
          is_favorite?: boolean
          last_used_at?: string | null
          scroll_speed?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          catchup_id: string | null
          client_profile_id: string
          content: string | null
          created_at: string
          id: string
          link: string | null
          obtained_at: string
          obtained_by: string | null
          type: string
          updated_at: string
        }
        Insert: {
          catchup_id?: string | null
          client_profile_id: string
          content?: string | null
          created_at?: string
          id?: string
          link?: string | null
          obtained_at?: string
          obtained_by?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          catchup_id?: string | null
          client_profile_id?: string
          content?: string | null
          created_at?: string
          id?: string
          link?: string | null
          obtained_at?: string
          obtained_by?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_catchup_id_fkey"
            columns: ["catchup_id"]
            isOneToOne: false
            referencedRelation: "client_catchups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonials_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_day_settings: {
        Row: {
          doc_label: string
          doc_url: string | null
          embed_mode: boolean
          embed_title: string | null
          embed_video_url: string | null
          id: number
          intro_body: string
          intro_title: string
          sections: Json
          updated_at: string
          updated_by: string | null
          video_label: string
          video_url: string | null
        }
        Insert: {
          doc_label?: string
          doc_url?: string | null
          embed_mode?: boolean
          embed_title?: string | null
          embed_video_url?: string | null
          id: number
          intro_body?: string
          intro_title?: string
          sections?: Json
          updated_at?: string
          updated_by?: string | null
          video_label?: string
          video_url?: string | null
        }
        Update: {
          doc_label?: string
          doc_url?: string | null
          embed_mode?: boolean
          embed_title?: string | null
          embed_video_url?: string | null
          id?: number
          intro_body?: string
          intro_title?: string
          sections?: Json
          updated_at?: string
          updated_by?: string | null
          video_label?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_day_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_leads: {
        Row: {
          candidate_id: string
          chosen_times: string[] | null
          client_profile_id: string | null
          close_lead_link: string
          company_name: string | null
          company_website: string | null
          contact_email: string | null
          contact_mobile: string | null
          contact_name: string | null
          contact_title: string | null
          converted_at: string | null
          converted_by: string | null
          converted_meeting_id: string | null
          created_at: string
          currently_hiring: boolean | null
          cv_candidate_level: string | null
          cv_candidate_titles: string | null
          decision_maker_email: string | null
          decision_maker_status: string | null
          id: string
          job_roles: Json
          job_spec_provided: boolean | null
          linkedin_url: string | null
          location_choice: string | null
          open_to_receiving_cvs: boolean | null
          other_decision_makers: boolean | null
          proposed_times: Json
          push_through_reason: string | null
          pushed_at: string | null
          pushed_to_user_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          trialist_notes: string | null
          trialist_user_id: string
          updated_at: string
        }
        Insert: {
          candidate_id: string
          chosen_times?: string[] | null
          client_profile_id?: string | null
          close_lead_link: string
          company_name?: string | null
          company_website?: string | null
          contact_email?: string | null
          contact_mobile?: string | null
          contact_name?: string | null
          contact_title?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_meeting_id?: string | null
          created_at?: string
          currently_hiring?: boolean | null
          cv_candidate_level?: string | null
          cv_candidate_titles?: string | null
          decision_maker_email?: string | null
          decision_maker_status?: string | null
          id?: string
          job_roles?: Json
          job_spec_provided?: boolean | null
          linkedin_url?: string | null
          location_choice?: string | null
          open_to_receiving_cvs?: boolean | null
          other_decision_makers?: boolean | null
          proposed_times?: Json
          push_through_reason?: string | null
          pushed_at?: string | null
          pushed_to_user_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trialist_notes?: string | null
          trialist_user_id: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          chosen_times?: string[] | null
          client_profile_id?: string | null
          close_lead_link?: string
          company_name?: string | null
          company_website?: string | null
          contact_email?: string | null
          contact_mobile?: string | null
          contact_name?: string | null
          contact_title?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_meeting_id?: string | null
          created_at?: string
          currently_hiring?: boolean | null
          cv_candidate_level?: string | null
          cv_candidate_titles?: string | null
          decision_maker_email?: string | null
          decision_maker_status?: string | null
          id?: string
          job_roles?: Json
          job_spec_provided?: boolean | null
          linkedin_url?: string | null
          location_choice?: string | null
          open_to_receiving_cvs?: boolean | null
          other_decision_makers?: boolean | null
          proposed_times?: Json
          push_through_reason?: string | null
          pushed_at?: string | null
          pushed_to_user_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trialist_notes?: string | null
          trialist_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_leads_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_leads_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_leads_converted_by_fkey"
            columns: ["converted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_leads_converted_meeting_fk"
            columns: ["converted_meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_leads_pushed_to_user_id_fkey"
            columns: ["pushed_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_leads_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_leads_trialist_user_id_fkey"
            columns: ["trialist_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievement_progress: {
        Row: {
          achievement_definition_id: string
          current_progress: number | null
          email: string
          id: string
          last_updated: string | null
          progress_pct: number | null
          target_value: number
          user_id: string
        }
        Insert: {
          achievement_definition_id: string
          current_progress?: number | null
          email: string
          id?: string
          last_updated?: string | null
          progress_pct?: number | null
          target_value: number
          user_id: string
        }
        Update: {
          achievement_definition_id?: string
          current_progress?: number | null
          email?: string
          id?: string
          last_updated?: string | null
          progress_pct?: number | null
          target_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievement_progress_achievement_definition_id_fkey"
            columns: ["achievement_definition_id"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_capabilities: {
        Row: {
          capability: string
          created_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_department_access: {
        Row: {
          created_at: string | null
          department: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          department: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          department?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_outages: {
        Row: {
          created_at: string
          department: string | null
          id: string
          note: string | null
          outage_type: string
          proof_url: string | null
          resolved_at: string | null
          severity: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          id?: string
          note?: string | null
          outage_type: string
          proof_url?: string | null
          resolved_at?: string | null
          severity: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          id?: string
          note?: string | null
          outage_type?: string
          proof_url?: string | null
          resolved_at?: string | null
          severity?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_outages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_workspace:
            | Database["public"]["Enums"]["workspace_type"]
            | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_workspace?:
            | Database["public"]["Enums"]["workspace_type"]
            | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_workspace?:
            | Database["public"]["Enums"]["workspace_type"]
            | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tab_restrictions: {
        Row: {
          created_at: string
          department: string
          granted_by: string | null
          hidden_tabs: string[]
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department: string
          granted_by?: string | null
          hidden_tabs?: string[]
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string
          granted_by?: string | null
          hidden_tabs?: string[]
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      warm_lead_status_updates: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          status: string
          updated_by: string
          warm_lead_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          status: string
          updated_by: string
          warm_lead_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_by?: string
          warm_lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warm_lead_status_updates_warm_lead_id_fkey"
            columns: ["warm_lead_id"]
            isOneToOne: false
            referencedRelation: "warm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      warm_leads: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          assigned_setter_id: string | null
          client_profile_id: string | null
          company_domain: string | null
          company_name: string | null
          created_at: string
          created_by_user_id: string
          email: string | null
          enrichment_request_id: string | null
          full_name: string | null
          id: string
          last_status_update: string | null
          lead_status: string
          linkedin_url: string
          phone: string | null
          prospect_job_title: string | null
          source: string | null
          status_updated_by: string | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assigned_setter_id?: string | null
          client_profile_id?: string | null
          company_domain?: string | null
          company_name?: string | null
          created_at?: string
          created_by_user_id: string
          email?: string | null
          enrichment_request_id?: string | null
          full_name?: string | null
          id?: string
          last_status_update?: string | null
          lead_status?: string
          linkedin_url: string
          phone?: string | null
          prospect_job_title?: string | null
          source?: string | null
          status_updated_by?: string | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assigned_setter_id?: string | null
          client_profile_id?: string | null
          company_domain?: string | null
          company_name?: string | null
          created_at?: string
          created_by_user_id?: string
          email?: string | null
          enrichment_request_id?: string | null
          full_name?: string | null
          id?: string
          last_status_update?: string | null
          lead_status?: string
          linkedin_url?: string
          phone?: string | null
          prospect_job_title?: string | null
          source?: string | null
          status_updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warm_leads_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warm_leads_enrichment_request_id_fkey"
            columns: ["enrichment_request_id"]
            isOneToOne: false
            referencedRelation: "enrichment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      setters_profiles_safe: {
        Row: {
          active: boolean | null
          created_at: string | null
          department: string | null
          email: string | null
          full_name: string | null
          id: string | null
          last_rivalry_ended_at: string | null
          last_rivalry_winner_email: string | null
          rival_email: string | null
          rivalry_end_date: string | null
          rivalry_end_pending: boolean | null
          rivalry_reward_amount: number | null
          rivalry_reward_set_by: string | null
          rivalry_reward_type: string | null
          rivalry_started_at: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          last_rivalry_ended_at?: string | null
          last_rivalry_winner_email?: string | null
          rival_email?: string | null
          rivalry_end_date?: string | null
          rivalry_end_pending?: boolean | null
          rivalry_reward_amount?: number | null
          rivalry_reward_set_by?: string | null
          rivalry_reward_type?: string | null
          rivalry_started_at?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          last_rivalry_ended_at?: string | null
          last_rivalry_winner_email?: string | null
          rival_email?: string | null
          rivalry_end_date?: string | null
          rivalry_end_pending?: boolean | null
          rivalry_reward_amount?: number | null
          rivalry_reward_set_by?: string | null
          rivalry_reward_type?: string | null
          rivalry_started_at?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      attendance_authority_tier: { Args: { _user_id: string }; Returns: string }
      can_manage_projects: { Args: { _user_id: string }; Returns: boolean }
      client_calendar_status: {
        Args: never
        Returns: {
          client_profile_id: string
          last_checked_at: string
          status: string
        }[]
      }
      close_partner_references: {
        Args: { _meeting_id: string; _won: boolean }
        Returns: undefined
      }
      complete_linked_task: {
        Args: {
          p_date?: string
          p_link_slot?: number
          p_link_type: string
          p_user: string
        }
        Returns: undefined
      }
      convert_trial_lead: {
        Args: { _lead_id: string; _meeting_id: string }
        Returns: undefined
      }
      current_setter_department: { Args: { _user: string }; Returns: string }
      decrypt_credentials: {
        Args: { p_client_profile_id: string }
        Returns: string
      }
      default_trial_alias: {
        Args: { _company: string; _exclude: string }
        Returns: string
      }
      dev_cron_status: {
        Args: never
        Returns: {
          active: boolean
          failures_24h: number
          jobname: string
          last_end: string
          last_message: string
          last_start: string
          last_status: string
          runs_24h: number
          schedule: string
          target: string
        }[]
      }
      encrypt_credentials: {
        Args: { p_client_profile_id: string; p_credentials_json: string }
        Returns: undefined
      }
      end_trial_access: { Args: { _candidate_id: string }; Returns: undefined }
      generate_invoice_number: { Args: never; Returns: string }
      get_default_departments_for_role: {
        Args: { role_name: string }
        Returns: string[]
      }
      has_capability: {
        Args: { _cap: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_sdr_manager_role: { Args: { _user_id: string }; Returns: boolean }
      is_accounting_role: { Args: { _user_id: string }; Returns: boolean }
      is_acquisition_pipeline_meeting: {
        Args: { _meeting_id: string }
        Returns: boolean
      }
      is_active_genuine_ae: { Args: { _user_id: string }; Returns: boolean }
      is_active_genuine_fulfilment_setter: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_active_genuine_setter_in_departments: {
        Args: { _departments: string[]; _user_id: string }
        Returns: boolean
      }
      is_admin_role: { Args: { _user_id: string }; Returns: boolean }
      is_client_of_profile: {
        Args: { _profile_id: string; _user_id: string }
        Returns: boolean
      }
      is_current_staff: { Args: { _user_id: string }; Returns: boolean }
      is_dev: { Args: { _user_id: string }; Returns: boolean }
      is_form_manager: { Args: { _uid: string }; Returns: boolean }
      is_genuine_ae: { Args: { _user_id: string }; Returns: boolean }
      is_genuine_fulfilment_setter: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_genuine_setter_in_departments: {
        Args: { _departments: string[]; _user_id: string }
        Returns: boolean
      }
      is_hr_role: { Args: { _user_id: string }; Returns: boolean }
      is_internal_user: { Args: { _user_id: string }; Returns: boolean }
      is_leave_admin: { Args: { _user_id: string }; Returns: boolean }
      is_ops_assistant: { Args: { _user_id: string }; Returns: boolean }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_sdr_manager_for_setter: {
        Args: { _setter_profile_id: string; _user_id: string }
        Returns: boolean
      }
      is_valid_active_setter_profile: {
        Args: { _setter_profile_id: string }
        Returns: boolean
      }
      materialize_task_instances: { Args: { p_date?: string }; Returns: number }
      notify_ta_cv_missing: {
        Args: { p_candidate_id: string; p_candidate_name: string }
        Returns: undefined
      }
      nudge_ops_attendance: { Args: never; Returns: undefined }
      outage_reader_departments: {
        Args: { _user_id: string }
        Returns: string[]
      }
      public_form: { Args: { _draft?: boolean; _slug: string }; Returns: Json }
      push_trial_lead: {
        Args: { _lead_id: string; _note: string; _setter_user_id: string }
        Returns: undefined
      }
      reject_trial_lead: {
        Args: { _lead_id: string; _reason: string }
        Returns: undefined
      }
      release_onboarding: {
        Args: { _onboarding_id: string }
        Returns: undefined
      }
      sdr_manager_departments: { Args: { _user: string }; Returns: string[] }
      sdr_manager_manages_aes: { Args: { _user: string }; Returns: boolean }
      set_trial_alias: {
        Args: { _alias: string; _client_id: string }
        Returns: string
      }
      submit_trial_lead: { Args: { _payload: Json }; Returns: string }
      trial_active_clients: {
        Args: never
        Returns: {
          id: string
          label: string
        }[]
      }
      trial_assignable_clients: {
        Args: never
        Returns: {
          company_name: string
          id: string
          trial_alias: string
        }[]
      }
      trialist_to_onboarding: {
        Args: {
          _candidate_id: string
          _onboarding_id: string
          _target_role: string
        }
        Returns: string
      }
      verify_admin_password: {
        Args: { password_input: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "setter"
        | "client"
        | "dev"
        | "ops"
        | "finance"
        | "csm"
        | "account_executive"
        | "accounting"
        | "hr"
        | "sdr_manager"
        | "gtm_engineer"
        | "ops_assistant"
        | "partner"
        | "talent_acquisition"
        | "trialist"
      candidate_assessment_status:
        | "new"
        | "shortlisted"
        | "rejected"
        | "moved_to_pipeline"
        | "invited"
        | "hired"
      client_profile_status: "active" | "inactive" | "pending"
      dev_mandate_company: "vexon" | "northgate" | "both"
      dev_mandate_status: "active" | "paused" | "archived"
      dev_stack_status: "active" | "planned"
      dev_target_build_type: "dashboard" | "workflow" | "agent" | "undecided"
      dev_target_status: "identified" | "building" | "testing" | "rolled_out"
      metrics_department: "acquisition" | "fulfilment"
      metrics_target_role:
        | "setter"
        | "account_executive"
        | "sdr_manager"
        | "ops"
      mismatch_flag_type: "none" | "input_higher" | "app_higher"
      notification_category:
        | "meeting"
        | "warm_lead"
        | "kpi"
        | "resource"
        | "system"
        | "achievement"
        | "catchup"
        | "renewal"
      payment_method_type:
        | "iwoca"
        | "stripe"
        | "direct_transfer"
        | "whop"
        | "other"
      payment_status: "paid" | "due" | "overdue" | "partial"
      setter_ramp_stage: "ramping" | "ramped"
      workspace_type: "setters" | "closers" | "ops" | "admin" | "dev"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "setter",
        "client",
        "dev",
        "ops",
        "finance",
        "csm",
        "account_executive",
        "accounting",
        "hr",
        "sdr_manager",
        "gtm_engineer",
        "ops_assistant",
        "partner",
        "talent_acquisition",
        "trialist",
      ],
      candidate_assessment_status: [
        "new",
        "shortlisted",
        "rejected",
        "moved_to_pipeline",
        "invited",
        "hired",
      ],
      client_profile_status: ["active", "inactive", "pending"],
      dev_mandate_company: ["vexon", "northgate", "both"],
      dev_mandate_status: ["active", "paused", "archived"],
      dev_stack_status: ["active", "planned"],
      dev_target_build_type: ["dashboard", "workflow", "agent", "undecided"],
      dev_target_status: ["identified", "building", "testing", "rolled_out"],
      metrics_department: ["acquisition", "fulfilment"],
      metrics_target_role: [
        "setter",
        "account_executive",
        "sdr_manager",
        "ops",
      ],
      mismatch_flag_type: ["none", "input_higher", "app_higher"],
      notification_category: [
        "meeting",
        "warm_lead",
        "kpi",
        "resource",
        "system",
        "achievement",
        "catchup",
        "renewal",
      ],
      payment_method_type: [
        "iwoca",
        "stripe",
        "direct_transfer",
        "whop",
        "other",
      ],
      payment_status: ["paid", "due", "overdue", "partial"],
      setter_ramp_stage: ["ramping", "ramped"],
      workspace_type: ["setters", "closers", "ops", "admin", "dev"],
    },
  },
} as const
