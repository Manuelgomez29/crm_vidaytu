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
  public: {
    Tables: {
      actividades: {
        Row: {
          contenido: string | null
          created_at: string
          id: string
          lead_id: string
          tipo: Database["public"]["Enums"]["tipo_actividad"]
          usuario_id: string | null
        }
        Insert: {
          contenido?: string | null
          created_at?: string
          id?: string
          lead_id: string
          tipo: Database["public"]["Enums"]["tipo_actividad"]
          usuario_id?: string | null
        }
        Update: {
          contenido?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          tipo?: Database["public"]["Enums"]["tipo_actividad"]
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actividades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actividades_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      adicciones: {
        Row: {
          activa: boolean
          created_at: string
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      auditoria: {
        Row: {
          accion: string
          created_at: string
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          id: number
          registro_id: string | null
          tabla: string
          usuario_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          id?: never
          registro_id?: string | null
          tabla: string
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          id?: never
          registro_id?: string | null
          tabla?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      ausencias: {
        Row: {
          created_at: string
          created_by: string | null
          desde: string
          hasta: string
          id: string
          motivo: string | null
          perfil_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          desde: string
          hasta: string
          id?: string
          motivo?: string | null
          perfil_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          desde?: string
          hasta?: string
          id?: string
          motivo?: string | null
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ausencias_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencias_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canales: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      caso_adjuntos: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          mime_type: string | null
          nombre_archivo: string
          storage_path: string
          subido_por: string | null
          tamano_bytes: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          mime_type?: string | null
          nombre_archivo: string
          storage_path: string
          subido_por?: string | null
          tamano_bytes?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          mime_type?: string | null
          nombre_archivo?: string
          storage_path?: string
          subido_por?: string | null
          tamano_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "caso_adjuntos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_adjuntos_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      centros: {
        Row: {
          activo: boolean
          ciudad: string | null
          created_at: string
          es_bandeja_grupo: boolean
          horario_atencion: Json | null
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          activo?: boolean
          ciudad?: string | null
          created_at?: string
          es_bandeja_grupo?: boolean
          horario_atencion?: Json | null
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          activo?: boolean
          ciudad?: string | null
          created_at?: string
          es_bandeja_grupo?: boolean
          horario_atencion?: Json | null
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      citas: {
        Row: {
          centro_id: string
          contacto_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_cita"]
          fin: string
          id: string
          inicio: string
          lead_id: string
          modalidad_cita: Database["public"]["Enums"]["modalidad_cita"]
          notas: string | null
          profesional_id: string
          tipo: Database["public"]["Enums"]["tipo_cita"]
        }
        Insert: {
          centro_id: string
          contacto_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_cita"]
          fin: string
          id?: string
          inicio: string
          lead_id: string
          modalidad_cita: Database["public"]["Enums"]["modalidad_cita"]
          notas?: string | null
          profesional_id: string
          tipo: Database["public"]["Enums"]["tipo_cita"]
        }
        Update: {
          centro_id?: string
          contacto_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_cita"]
          fin?: string
          id?: string
          inicio?: string
          lead_id?: string
          modalidad_cita?: Database["public"]["Enums"]["modalidad_cita"]
          notas?: string | null
          profesional_id?: string
          tipo?: Database["public"]["Enums"]["tipo_cita"]
        }
        Relationships: [
          {
            foreignKeyName: "citas_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion: {
        Row: {
          clave: string
          created_at: string
          descripcion: string | null
          updated_at: string
          updated_by: string | null
          valor: Json
        }
        Insert: {
          clave: string
          created_at?: string
          descripcion?: string | null
          updated_at?: string
          updated_by?: string | null
          valor: Json
        }
        Update: {
          clave?: string
          created_at?: string
          descripcion?: string | null
          updated_at?: string
          updated_by?: string | null
          valor?: Json
        }
        Relationships: []
      }
      contacto_etiquetas: {
        Row: {
          aplicada_por: string | null
          contacto_id: string
          created_at: string
          etiqueta_id: string
          id: string
          regla_id: string | null
        }
        Insert: {
          aplicada_por?: string | null
          contacto_id: string
          created_at?: string
          etiqueta_id: string
          id?: string
          regla_id?: string | null
        }
        Update: {
          aplicada_por?: string | null
          contacto_id?: string
          created_at?: string
          etiqueta_id?: string
          id?: string
          regla_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacto_etiquetas_aplicada_por_fkey"
            columns: ["aplicada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacto_etiquetas_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacto_etiquetas_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "etiquetas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacto_etiquetas_regla_id_fkey"
            columns: ["regla_id"]
            isOneToOne: false
            referencedRelation: "reglas_etiquetado"
            referencedColumns: ["id"]
          },
        ]
      }
      contactos: {
        Row: {
          consentimiento_marketing: boolean
          consentimiento_marketing_at: string | null
          consentimiento_marketing_origen: string | null
          created_at: string
          email: string | null
          id: string
          nombre: string
          notas: string | null
          telefono: string
          updated_at: string
          zona: string | null
        }
        Insert: {
          consentimiento_marketing?: boolean
          consentimiento_marketing_at?: string | null
          consentimiento_marketing_origen?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          notas?: string | null
          telefono: string
          updated_at?: string
          zona?: string | null
        }
        Update: {
          consentimiento_marketing?: boolean
          consentimiento_marketing_at?: string | null
          consentimiento_marketing_origen?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          telefono?: string
          updated_at?: string
          zona?: string | null
        }
        Relationships: []
      }
      conversiones: {
        Row: {
          centro_id: string
          created_at: string
          estado: Database["public"]["Enums"]["estado_conversion"]
          fecha_inicio: string | null
          id: string
          importe_primer_pago: number | null
          lead_id: string
          modalidad_id: string | null
          presupuesto_id: string | null
          registrada_por: string | null
          validada_at: string | null
          validada_por: string | null
        }
        Insert: {
          centro_id: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_conversion"]
          fecha_inicio?: string | null
          id?: string
          importe_primer_pago?: number | null
          lead_id: string
          modalidad_id?: string | null
          presupuesto_id?: string | null
          registrada_por?: string | null
          validada_at?: string | null
          validada_por?: string | null
        }
        Update: {
          centro_id?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_conversion"]
          fecha_inicio?: string | null
          id?: string
          importe_primer_pago?: number | null
          lead_id?: string
          modalidad_id?: string | null
          presupuesto_id?: string | null
          registrada_por?: string | null
          validada_at?: string | null
          validada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversiones_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversiones_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversiones_modalidad_id_fkey"
            columns: ["modalidad_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversiones_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversiones_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversiones_validada_por_fkey"
            columns: ["validada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      derivaciones: {
        Row: {
          centro_destino_id: string
          centro_origen_id: string
          created_at: string
          id: string
          lead_id: string
          motivo: string | null
        }
        Insert: {
          centro_destino_id: string
          centro_origen_id: string
          created_at?: string
          id?: string
          lead_id: string
          motivo?: string | null
        }
        Update: {
          centro_destino_id?: string
          centro_origen_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "derivaciones_centro_destino_id_fkey"
            columns: ["centro_destino_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "derivaciones_centro_origen_id_fkey"
            columns: ["centro_origen_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "derivaciones_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      disponibilidad: {
        Row: {
          created_at: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id: string
          perfil_id: string
        }
        Insert: {
          created_at?: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id?: string
          perfil_id: string
        }
        Update: {
          created_at?: string
          dia_semana?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidad_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      etiquetas: {
        Row: {
          activa: boolean
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "etiquetas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contactos: {
        Row: {
          contacto_id: string
          created_at: string
          es_principal: boolean
          id: string
          lead_id: string
          relacion: string | null
          tipo: Database["public"]["Enums"]["tipo_contacto_caso"]
        }
        Insert: {
          contacto_id: string
          created_at?: string
          es_principal?: boolean
          id?: string
          lead_id: string
          relacion?: string | null
          tipo: Database["public"]["Enums"]["tipo_contacto_caso"]
        }
        Update: {
          contacto_id?: string
          created_at?: string
          es_principal?: boolean
          id?: string
          lead_id?: string
          relacion?: string | null
          tipo?: Database["public"]["Enums"]["tipo_contacto_caso"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_contactos_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_contactos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          adiccion_id: string | null
          canal_id: string
          centro_id: string
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["estado_lead"]
          etapa_id: string
          id: string
          landing_url: string | null
          modalidad_interes_id: string | null
          motivo_perdida_id: string | null
          nombre: string
          nombre_afectado: string | null
          origen_ref: string | null
          origen_sistema: string | null
          pipeline_id: string
          prescriptor_nombre: string | null
          primera_respuesta_at: string | null
          propietario_id: string | null
          quien_contacta:
            | Database["public"]["Enums"]["tipo_contacto_caso"]
            | null
          relacion_con_afectado: string | null
          subcanal: string | null
          telefono: string
          updated_at: string
          urgencia: Database["public"]["Enums"]["urgencia_lead"] | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          zona: string | null
        }
        Insert: {
          adiccion_id?: string | null
          canal_id: string
          centro_id: string
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["estado_lead"]
          etapa_id: string
          id?: string
          landing_url?: string | null
          modalidad_interes_id?: string | null
          motivo_perdida_id?: string | null
          nombre: string
          nombre_afectado?: string | null
          origen_ref?: string | null
          origen_sistema?: string | null
          pipeline_id: string
          prescriptor_nombre?: string | null
          primera_respuesta_at?: string | null
          propietario_id?: string | null
          quien_contacta?:
            | Database["public"]["Enums"]["tipo_contacto_caso"]
            | null
          relacion_con_afectado?: string | null
          subcanal?: string | null
          telefono: string
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["urgencia_lead"] | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          zona?: string | null
        }
        Update: {
          adiccion_id?: string | null
          canal_id?: string
          centro_id?: string
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["estado_lead"]
          etapa_id?: string
          id?: string
          landing_url?: string | null
          modalidad_interes_id?: string | null
          motivo_perdida_id?: string | null
          nombre?: string
          nombre_afectado?: string | null
          origen_ref?: string | null
          origen_sistema?: string | null
          pipeline_id?: string
          prescriptor_nombre?: string | null
          primera_respuesta_at?: string | null
          propietario_id?: string | null
          quien_contacta?:
            | Database["public"]["Enums"]["tipo_contacto_caso"]
            | null
          relacion_con_afectado?: string | null
          subcanal?: string | null
          telefono?: string
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["urgencia_lead"] | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_adiccion_id_fkey"
            columns: ["adiccion_id"]
            isOneToOne: false
            referencedRelation: "adicciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "canales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "pipeline_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_modalidad_interes_id_fkey"
            columns: ["modalidad_interes_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_motivo_perdida_id_fkey"
            columns: ["motivo_perdida_id"]
            isOneToOne: false
            referencedRelation: "motivos_perdida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_propietario_id_fkey"
            columns: ["propietario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_contactos: {
        Row: {
          added_by: string | null
          contacto_id: string
          created_at: string
          id: string
          lista_id: string
        }
        Insert: {
          added_by?: string | null
          contacto_id: string
          created_at?: string
          id?: string
          lista_id: string
        }
        Update: {
          added_by?: string | null
          contacto_id?: string
          created_at?: string
          id?: string
          lista_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_contactos_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_contactos_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_contactos_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "listas"
            referencedColumns: ["id"]
          },
        ]
      }
      listas: {
        Row: {
          created_at: string
          created_by: string | null
          descripcion: string | null
          filtro: Json | null
          id: string
          nombre: string
          tipo: Database["public"]["Enums"]["tipo_lista"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          filtro?: Json | null
          id?: string
          nombre: string
          tipo: Database["public"]["Enums"]["tipo_lista"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          filtro?: Json | null
          id?: string
          nombre?: string
          tipo?: Database["public"]["Enums"]["tipo_lista"]
        }
        Relationships: [
          {
            foreignKeyName: "listas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      modalidad_centros: {
        Row: {
          centro_id: string
          created_at: string
          id: string
          modalidad_id: string
        }
        Insert: {
          centro_id: string
          created_at?: string
          id?: string
          modalidad_id: string
        }
        Update: {
          centro_id?: string
          created_at?: string
          id?: string
          modalidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modalidad_centros_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modalidad_centros_modalidad_id_fkey"
            columns: ["modalidad_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
        ]
      }
      modalidades: {
        Row: {
          activa: boolean
          created_at: string
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      motivos_perdida: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      notificaciones: {
        Row: {
          created_at: string
          email_enviado_at: string | null
          id: string
          lead_id: string | null
          leida_at: string | null
          mensaje: string
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
          usuario_id: string
        }
        Insert: {
          created_at?: string
          email_enviado_at?: string | null
          id?: string
          lead_id?: string | null
          leida_at?: string | null
          mensaje: string
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
          usuario_id: string
        }
        Update: {
          created_at?: string
          email_enviado_at?: string | null
          id?: string
          lead_id?: string | null
          leida_at?: string | null
          mensaje?: string
          tipo?: Database["public"]["Enums"]["tipo_notificacion"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      objetivos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mes: string
          meta_citas: number | null
          meta_conversiones: number | null
          meta_ingresos: number | null
          perfil_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mes: string
          meta_citas?: number | null
          meta_conversiones?: number | null
          meta_ingresos?: number | null
          perfil_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mes?: string
          meta_citas?: number | null
          meta_conversiones?: number | null
          meta_ingresos?: number | null
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "objetivos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objetivos_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_centros: {
        Row: {
          centro_id: string
          created_at: string
          id: string
          perfil_id: string
        }
        Insert: {
          centro_id: string
          created_at?: string
          id?: string
          perfil_id: string
        }
        Update: {
          centro_id?: string
          created_at?: string
          id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_centros_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_centros_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          activo: boolean
          created_at: string
          email: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
        }
        Relationships: []
      }
      pipeline_etapas: {
        Row: {
          created_at: string
          estado_sistema: Database["public"]["Enums"]["estado_lead"]
          id: string
          nombre: string
          orden: number
          pipeline_id: string
        }
        Insert: {
          created_at?: string
          estado_sistema: Database["public"]["Enums"]["estado_lead"]
          id?: string
          nombre: string
          orden: number
          pipeline_id: string
        }
        Update: {
          created_at?: string
          estado_sistema?: Database["public"]["Enums"]["estado_lead"]
          id?: string
          nombre?: string
          orden?: number
          pipeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_etapas_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          activo: boolean
          centro_id: string | null
          created_at: string
          created_by: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          centro_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          centro_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuestos: {
        Row: {
          creado_por: string | null
          created_at: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_presupuesto"]
          id: string
          importe: number
          lead_id: string
          modalidad_id: string | null
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_presupuesto"]
          id?: string
          importe: number
          lead_id: string
          modalidad_id?: string | null
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_presupuesto"]
          id?: string
          importe?: number
          lead_id?: string
          modalidad_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuestos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_modalidad_id_fkey"
            columns: ["modalidad_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
        ]
      }
      reglas_etiquetado: {
        Row: {
          activa: boolean
          condicion: Json
          created_at: string
          etiqueta_id: string
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          condicion: Json
          created_at?: string
          etiqueta_id: string
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          condicion?: Json
          created_at?: string
          etiqueta_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "reglas_etiquetado_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "etiquetas"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas: {
        Row: {
          completada_at: string | null
          created_at: string
          id: string
          lead_id: string
          responsable_id: string | null
          titulo: string
          vence_at: string
        }
        Insert: {
          completada_at?: string | null
          created_at?: string
          id?: string
          lead_id: string
          responsable_id?: string | null
          titulo: string
          vence_at: string
        }
        Update: {
          completada_at?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          responsable_id?: string | null
          titulo?: string
          vence_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      es_direccion: { Args: never; Returns: boolean }
      mi_rol: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
      mis_centros: { Args: never; Returns: string[] }
    }
    Enums: {
      estado_cita: "programada" | "realizada" | "no_show" | "cancelada"
      estado_conversion: "pendiente_validacion" | "validada"
      estado_lead:
        | "nuevo"
        | "contactado"
        | "cita_agendada"
        | "cita_realizada"
        | "en_valoracion"
        | "convertido"
        | "derivado"
        | "perdido"
        | "no_valido"
        | "reabierto"
      estado_presupuesto: "propuesto" | "aceptado" | "rechazado"
      modalidad_cita: "presencial" | "videollamada" | "telefonica"
      rol_usuario: "direccion" | "admisiones" | "terapeuta"
      tipo_actividad:
        | "llamada"
        | "whatsapp"
        | "email"
        | "nota"
        | "cambio_estado"
        | "reapertura"
      tipo_cita:
        | "primera_llamada"
        | "primera_cita"
        | "valoracion"
        | "seguimiento"
        | "visita_centro"
        | "otro"
      tipo_contacto_caso: "familiar" | "afectado" | "prescriptor" | "otro"
      tipo_lista: "estatica" | "dinamica"
      tipo_notificacion:
        | "lead_asignado"
        | "lead_sin_atender"
        | "tarea_asignada"
        | "tarea_vencida"
        | "cita_proxima"
        | "lead_nuevo_bandeja"
        | "presupuesto_sin_respuesta"
        | "resumen_diario"
      urgencia_lead: "alta" | "media" | "baja"
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
  public: {
    Enums: {
      estado_cita: ["programada", "realizada", "no_show", "cancelada"],
      estado_conversion: ["pendiente_validacion", "validada"],
      estado_lead: [
        "nuevo",
        "contactado",
        "cita_agendada",
        "cita_realizada",
        "en_valoracion",
        "convertido",
        "derivado",
        "perdido",
        "no_valido",
        "reabierto",
      ],
      estado_presupuesto: ["propuesto", "aceptado", "rechazado"],
      modalidad_cita: ["presencial", "videollamada", "telefonica"],
      rol_usuario: ["direccion", "admisiones", "terapeuta"],
      tipo_actividad: [
        "llamada",
        "whatsapp",
        "email",
        "nota",
        "cambio_estado",
        "reapertura",
      ],
      tipo_cita: [
        "primera_llamada",
        "primera_cita",
        "valoracion",
        "seguimiento",
        "visita_centro",
        "otro",
      ],
      tipo_contacto_caso: ["familiar", "afectado", "prescriptor", "otro"],
      tipo_lista: ["estatica", "dinamica"],
      tipo_notificacion: [
        "lead_asignado",
        "lead_sin_atender",
        "tarea_asignada",
        "tarea_vencida",
        "cita_proxima",
        "lead_nuevo_bandeja",
        "presupuesto_sin_respuesta",
        "resumen_diario",
      ],
      urgencia_lead: ["alta", "media", "baja"],
    },
  },
} as const
