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
      order_clicks: {
        Row: {
          click_date: string
          created_at: string
          id: string
          product_id: string
          size: number
          store_id: string
          visitor_id: string
        }
        Insert: {
          click_date: string
          created_at?: string
          id?: string
          product_id: string
          size: number
          store_id: string
          visitor_id: string
        }
        Update: {
          click_date?: string
          created_at?: string
          id?: string
          product_id?: string
          size?: number
          store_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_clicks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_clicks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pageviews: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          store_id: string
          view_date: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          store_id: string
          view_date: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          store_id?: string
          view_date?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pageviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pageviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_photos: {
        Row: {
          created_at: string
          id: string
          position: number
          product_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          product_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          product_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_photos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sizes: {
        Row: {
          available: boolean
          product_id: string
          size: number
        }
        Insert: {
          available?: boolean
          product_id: string
          size: number
        }
        Update: {
          available?: boolean
          product_id?: string
          size?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_sizes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string
          brand_other: string | null
          category: string | null
          created_at: string
          description: string | null
          fulfillment: string | null
          hide_when_sold_out: boolean | null
          id: string
          line: string | null
          name: string
          price: number
          sole: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          brand: string
          brand_other?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          fulfillment?: string | null
          hide_when_sold_out?: boolean | null
          id?: string
          line?: string | null
          name: string
          price: number
          sole?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          brand?: string
          brand_other?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          fulfillment?: string | null
          hide_when_sold_out?: boolean | null
          id?: string
          line?: string | null
          name?: string
          price?: number
          sole?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          message_template: string | null
          onboarding_completed_at: string | null
          store_id: string
          whatsapp_e164: string | null
        }
        Insert: {
          message_template?: string | null
          onboarding_completed_at?: string | null
          store_id: string
          whatsapp_e164?: string | null
        }
        Update: {
          message_template?: string | null
          onboarding_completed_at?: string | null
          store_id?: string
          whatsapp_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          accent_color: string | null
          cover_aspect_ratio: number | null
          cover_band_ratio: number
          cover_pos_x: number
          cover_pos_y: number
          cover_url: string | null
          cover_zoom: number
          created_at: string
          hide_sold_out_default: boolean
          id: string
          instagram: string | null
          logo_url: string | null
          name: string
          owner_id: string
          slug: string
          tagline: string | null
          timezone: string
        }
        Insert: {
          accent_color?: string | null
          cover_aspect_ratio?: number | null
          cover_band_ratio?: number
          cover_pos_x?: number
          cover_pos_y?: number
          cover_url?: string | null
          cover_zoom?: number
          created_at?: string
          hide_sold_out_default?: boolean
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name: string
          owner_id: string
          slug: string
          tagline?: string | null
          timezone?: string
        }
        Update: {
          accent_color?: string | null
          cover_aspect_ratio?: number | null
          cover_band_ratio?: number
          cover_pos_x?: number
          cover_pos_y?: number
          cover_url?: string | null
          cover_zoom?: number
          created_at?: string
          hide_sold_out_default?: boolean
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          slug?: string
          tagline?: string | null
          timezone?: string
        }
        Relationships: []
      }
    }
    Views: {
      product_order_click_counts: {
        Row: {
          clicks: number | null
          product_id: string | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_clicks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_clicks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_pageview_counts: {
        Row: {
          product_id: string | null
          store_id: string | null
          views: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pageviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pageviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_slug_available: { Args: { candidate_slug: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
