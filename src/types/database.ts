export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Timestamps = {
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Timestamps & {
          id: string
          display_name: string | null
        }
        Insert: {
          id: string
          display_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          display_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      exercises: {
        Row: Timestamps & {
          id: string
          user_id: string
          stable_key: string
          name: string
          muscle_group: string
          equipment: string | null
          notes: string | null
          active: boolean
        }
        Insert: {
          id?: string
          user_id: string
          stable_key: string
          name: string
          muscle_group: string
          equipment?: string | null
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['exercises']['Insert']>
        Relationships: []
      }
      workout_templates: {
        Row: Timestamps & {
          id: string
          user_id: string
          stable_key: string
          name: string
          day_of_week: number
          notes: string | null
          active: boolean
        }
        Insert: {
          id?: string
          user_id: string
          stable_key: string
          name: string
          day_of_week: number
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['workout_templates']['Insert']>
        Relationships: []
      }
      template_exercises: {
        Row: Timestamps & {
          id: string
          user_id: string
          template_id: string
          exercise_id: string
          position: number
          target_sets: number
          target_reps: string
          rest_seconds: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          user_id: string
          template_id: string
          exercise_id: string
          position: number
          target_sets: number
          target_reps: string
          rest_seconds?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['template_exercises']['Insert']>
        Relationships: []
      }
      workout_sessions: {
        Row: Timestamps & {
          id: string
          user_id: string
          client_id: string
          template_id: string | null
          name: string
          day_of_week: number
          started_at: string
          completed_at: string | null
          duration_minutes: number | null
          volume_kg: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          template_id?: string | null
          name: string
          day_of_week: number
          started_at: string
          completed_at?: string | null
          duration_minutes?: number | null
          volume_kg?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['workout_sessions']['Insert']>
        Relationships: []
      }
      workout_drafts: {
        Row: Timestamps & {
          id: string
          user_id: string
          day_of_week: number
          draft_key: string
          payload: Json
        }
        Insert: {
          id?: string
          user_id: string
          day_of_week: number
          draft_key: string
          payload: Json
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['workout_drafts']['Insert']>
        Relationships: []
      }
      exercise_logs: {
        Row: Timestamps & {
          id: string
          user_id: string
          client_id: string
          session_id: string
          exercise_id: string
          position: number
          working_weight_kg: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          session_id: string
          exercise_id: string
          position: number
          working_weight_kg?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['exercise_logs']['Insert']>
        Relationships: []
      }
      set_logs: {
        Row: Timestamps & {
          id: string
          user_id: string
          client_id: string
          exercise_log_id: string
          set_number: number
          reps: number | null
          weight_kg: number
          weight_override_kg: number | null
          completed: boolean
          is_warmup: boolean
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          exercise_log_id: string
          set_number: number
          reps?: number | null
          weight_kg?: number
          weight_override_kg?: number | null
          completed?: boolean
          is_warmup?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['set_logs']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      sync_revision: { Args: { p_user_id: string; p_resource: string }; Returns: string }
      sync_session_versions: { Args: { p_user_id: string }; Returns: Json }
      apply_sync_operation: {
        Args: { p_user_id: string; p_operation_id: string; p_resource: string; p_expected: string; p_payload: Json }
        Returns: Json
      }
      save_workout_session: {
        Args: { p_user_id: string; p_session: Json; p_exercises: Json; p_template?: Json }
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
