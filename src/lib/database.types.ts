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
      bajas_marketing: {
        Row: {
          campana_id: string | null
          contacto_id: string
          created_at: string
          id: string
          origen: string
        }
        Insert: {
          campana_id?: string | null
          contacto_id: string
          created_at?: string
          id?: string
          origen?: string
        }
        Update: {
          campana_id?: string | null
          contacto_id?: string
          created_at?: string
          id?: string
          origen?: string
        }
        Relationships: [
          {
            foreignKeyName: "bajas_marketing_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas_email"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bajas_marketing_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
        ]
      }
      campana_destinatarios: {
        Row: {
          abierto_at: string | null
          baja_at: string | null
          campana_id: string
          clic_at: string | null
          contacto_id: string
          created_at: string
          email: string
          enviado_at: string | null
          error: string | null
          estado: Database["public"]["Enums"]["estado_envio"]
          id: string
          token: string
        }
        Insert: {
          abierto_at?: string | null
          baja_at?: string | null
          campana_id: string
          clic_at?: string | null
          contacto_id: string
          created_at?: string
          email: string
          enviado_at?: string | null
          error?: string | null
          estado?: Database["public"]["Enums"]["estado_envio"]
          id?: string
          token?: string
        }
        Update: {
          abierto_at?: string | null
          baja_at?: string | null
          campana_id?: string
          clic_at?: string | null
          contacto_id?: string
          created_at?: string
          email?: string
          enviado_at?: string | null
          error?: string | null
          estado?: Database["public"]["Enums"]["estado_envio"]
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "campana_destinatarios_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas_email"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campana_destinatarios_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
        ]
      }
      campanas_email: {
        Row: {
          asunto: string
          created_at: string
          created_by: string | null
          cuerpo_html: string | null
          cuerpo_texto: string
          enviada_at: string | null
          estado: Database["public"]["Enums"]["estado_campana"]
          id: string
          lista_id: string | null
          nombre: string
          programada_para: string | null
          total_aperturas: number
          total_bajas: number
          total_clics: number
          total_destinatarios: number
          total_enviados: number
          total_fallidos: number
          updated_at: string
        }
        Insert: {
          asunto: string
          created_at?: string
          created_by?: string | null
          cuerpo_html?: string | null
          cuerpo_texto: string
          enviada_at?: string | null
          estado?: Database["public"]["Enums"]["estado_campana"]
          id?: string
          lista_id?: string | null
          nombre: string
          programada_para?: string | null
          total_aperturas?: number
          total_bajas?: number
          total_clics?: number
          total_destinatarios?: number
          total_enviados?: number
          total_fallidos?: number
          updated_at?: string
        }
        Update: {
          asunto?: string
          created_at?: string
          created_by?: string | null
          cuerpo_html?: string | null
          cuerpo_texto?: string
          enviada_at?: string | null
          estado?: Database["public"]["Enums"]["estado_campana"]
          id?: string
          lista_id?: string | null
          nombre?: string
          programada_para?: string | null
          total_aperturas?: number
          total_bajas?: number
          total_clics?: number
          total_destinatarios?: number
          total_enviados?: number
          total_fallidos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanas_email_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanas_email_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "listas"
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
          direccion: string | null
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
          direccion?: string | null
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
          direccion?: string | null
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
          recordatorio_enviado_at: string | null
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
          recordatorio_enviado_at?: string | null
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
          recordatorio_enviado_at?: string | null
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
      cobros: {
        Row: {
          centro_id: string
          created_at: string
          es_primer_pago: boolean
          factura_id: string | null
          fecha: string
          id: string
          importe: number
          lead_id: string | null
          metodo: Database["public"]["Enums"]["metodo_cobro"]
          notas: string | null
          registrado_por: string | null
        }
        Insert: {
          centro_id: string
          created_at?: string
          es_primer_pago?: boolean
          factura_id?: string | null
          fecha?: string
          id?: string
          importe: number
          lead_id?: string | null
          metodo?: Database["public"]["Enums"]["metodo_cobro"]
          notas?: string | null
          registrado_por?: string | null
        }
        Update: {
          centro_id?: string
          created_at?: string
          es_primer_pago?: boolean
          factura_id?: string | null
          fecha?: string
          id?: string
          importe?: number
          lead_id?: string | null
          metodo?: Database["public"]["Enums"]["metodo_cobro"]
          notas?: string | null
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobros_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_registrado_por_fkey"
            columns: ["registrado_por"]
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
      conversacion_participantes: {
        Row: {
          conversacion_id: string
          created_at: string
          id: string
          leido_at: string | null
          perfil_id: string
        }
        Insert: {
          conversacion_id: string
          created_at?: string
          id?: string
          leido_at?: string | null
          perfil_id: string
        }
        Update: {
          conversacion_id?: string
          created_at?: string
          id?: string
          leido_at?: string | null
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversacion_participantes_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversacion_participantes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversaciones: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          paciente_id: string | null
          titulo: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          paciente_id?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          paciente_id?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversaciones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversaciones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
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
          resena_enviada_at: string | null
          resena_propuesta_at: string | null
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
          resena_enviada_at?: string | null
          resena_propuesta_at?: string | null
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
          resena_enviada_at?: string | null
          resena_propuesta_at?: string | null
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
      cuestionario_preguntas: {
        Row: {
          cuestionario_id: string
          id: string
          orden: number
          texto: string
          valor_max: number
          valor_min: number
        }
        Insert: {
          cuestionario_id: string
          id?: string
          orden: number
          texto: string
          valor_max?: number
          valor_min?: number
        }
        Update: {
          cuestionario_id?: string
          id?: string
          orden?: number
          texto?: string
          valor_max?: number
          valor_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "cuestionario_preguntas_cuestionario_id_fkey"
            columns: ["cuestionario_id"]
            isOneToOne: false
            referencedRelation: "cuestionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cuestionario_respuesta_items: {
        Row: {
          id: string
          pregunta_id: string
          respuesta_id: string
          valor: number
        }
        Insert: {
          id?: string
          pregunta_id: string
          respuesta_id: string
          valor: number
        }
        Update: {
          id?: string
          pregunta_id?: string
          respuesta_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "cuestionario_respuesta_items_pregunta_id_fkey"
            columns: ["pregunta_id"]
            isOneToOne: false
            referencedRelation: "cuestionario_preguntas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuestionario_respuesta_items_respuesta_id_fkey"
            columns: ["respuesta_id"]
            isOneToOne: false
            referencedRelation: "cuestionario_respuestas"
            referencedColumns: ["id"]
          },
        ]
      }
      cuestionario_respuestas: {
        Row: {
          created_at: string
          cuestionario_id: string
          fecha: string
          id: string
          notas: string | null
          paciente_id: string
          puntuacion_total: number | null
          registrado_por: string | null
        }
        Insert: {
          created_at?: string
          cuestionario_id: string
          fecha?: string
          id?: string
          notas?: string | null
          paciente_id: string
          puntuacion_total?: number | null
          registrado_por?: string | null
        }
        Update: {
          created_at?: string
          cuestionario_id?: string
          fecha?: string
          id?: string
          notas?: string | null
          paciente_id?: string
          puntuacion_total?: number | null
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuestionario_respuestas_cuestionario_id_fkey"
            columns: ["cuestionario_id"]
            isOneToOne: false
            referencedRelation: "cuestionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuestionario_respuestas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuestionario_respuestas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cuestionarios: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
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
      documentos_clinicos: {
        Row: {
          created_at: string
          id: string
          nombre: string
          paciente_id: string
          ruta: string
          subido_por: string | null
          tamano_bytes: number | null
          tipo: Database["public"]["Enums"]["tipo_documento_clinico"]
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          paciente_id: string
          ruta: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tipo?: Database["public"]["Enums"]["tipo_documento_clinico"]
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          paciente_id?: string
          ruta?: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tipo?: Database["public"]["Enums"]["tipo_documento_clinico"]
        }
        Relationships: [
          {
            foreignKeyName: "documentos_clinicos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_clinicos_subido_por_fkey"
            columns: ["subido_por"]
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
      factura_lineas: {
        Row: {
          cantidad: number
          concepto: string
          factura_id: string
          id: string
          orden: number
          precio_unitario: number
        }
        Insert: {
          cantidad?: number
          concepto: string
          factura_id: string
          id?: string
          orden?: number
          precio_unitario: number
        }
        Update: {
          cantidad?: number
          concepto?: string
          factura_id?: string
          id?: string
          orden?: number
          precio_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "factura_lineas_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          base_imponible: number
          centro_id: string
          cliente_direccion: string | null
          cliente_email: string | null
          cliente_nif: string | null
          cliente_nombre: string
          conversion_id: string | null
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["estado_factura"]
          fecha: string
          id: string
          iva_porcentaje: number
          lead_id: string | null
          notas: string | null
          numero: string | null
          presupuesto_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          base_imponible?: number
          centro_id: string
          cliente_direccion?: string | null
          cliente_email?: string | null
          cliente_nif?: string | null
          cliente_nombre: string
          conversion_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["estado_factura"]
          fecha?: string
          id?: string
          iva_porcentaje?: number
          lead_id?: string | null
          notas?: string | null
          numero?: string | null
          presupuesto_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          base_imponible?: number
          centro_id?: string
          cliente_direccion?: string | null
          cliente_email?: string | null
          cliente_nif?: string | null
          cliente_nombre?: string
          conversion_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["estado_factura"]
          fecha?: string
          id?: string
          iva_porcentaje?: number
          lead_id?: string | null
          notas?: string | null
          numero?: string | null
          presupuesto_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturas_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_conversion_id_fkey"
            columns: ["conversion_id"]
            isOneToOne: false
            referencedRelation: "conversiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      familiares: {
        Row: {
          created_at: string
          email: string | null
          es_contacto_emergencia: boolean
          id: string
          nombre: string
          notas: string | null
          paciente_id: string
          relacion: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          es_contacto_emergencia?: boolean
          id?: string
          nombre: string
          notas?: string | null
          paciente_id: string
          relacion?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          es_contacto_emergencia?: boolean
          id?: string
          nombre?: string
          notas?: string | null
          paciente_id?: string
          relacion?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "familiares_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fases_metodo: {
        Row: {
          activa: boolean
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activa?: boolean
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden: number
        }
        Update: {
          activa?: boolean
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      gasto_campanas: {
        Row: {
          campana: string
          centro_id: string | null
          created_at: string
          created_by: string | null
          desde: string
          hasta: string
          id: string
          importe: number
          notas: string | null
          plataforma: string
          updated_at: string
        }
        Insert: {
          campana: string
          centro_id?: string | null
          created_at?: string
          created_by?: string | null
          desde: string
          hasta: string
          id?: string
          importe: number
          notas?: string | null
          plataforma: string
          updated_at?: string
        }
        Update: {
          campana?: string
          centro_id?: string | null
          created_at?: string
          created_by?: string | null
          desde?: string
          hasta?: string
          id?: string
          importe?: number
          notas?: string | null
          plataforma?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gasto_campanas_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_campanas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      habitaciones: {
        Row: {
          activa: boolean
          centro_id: string
          created_at: string
          id: string
          nombre: string
          plazas: number
        }
        Insert: {
          activa?: boolean
          centro_id: string
          created_at?: string
          id?: string
          nombre: string
          plazas?: number
        }
        Update: {
          activa?: boolean
          centro_id?: string
          created_at?: string
          id?: string
          nombre?: string
          plazas?: number
        }
        Relationships: [
          {
            foreignKeyName: "habitaciones_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_consultas: {
        Row: {
          ambito: string
          created_at: string
          error: string | null
          filas_consultadas: number | null
          id: string
          paciente_id: string | null
          pregunta: string
          respuesta: string | null
          usuario_id: string | null
        }
        Insert: {
          ambito: string
          created_at?: string
          error?: string | null
          filas_consultadas?: number | null
          id?: string
          paciente_id?: string | null
          pregunta: string
          respuesta?: string | null
          usuario_id?: string | null
        }
        Update: {
          ambito?: string
          created_at?: string
          error?: string | null
          filas_consultadas?: number | null
          id?: string
          paciente_id?: string | null
          pregunta?: string
          respuesta?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_consultas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_consultas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integraciones: {
        Row: {
          activa: boolean
          ajustes: Json
          clave: string
          created_at: string
          id: string
          nombre: string
          ultima_sincronizacion_at: string | null
          ultimo_error: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          ajustes?: Json
          clave: string
          created_at?: string
          id?: string
          nombre: string
          ultima_sincronizacion_at?: string | null
          ultimo_error?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          ajustes?: Json
          clave?: string
          created_at?: string
          id?: string
          nombre?: string
          ultima_sincronizacion_at?: string | null
          ultimo_error?: string | null
          updated_at?: string
        }
        Relationships: []
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
          puntuacion: number
          puntuacion_at: string | null
          quien_contacta:
            | Database["public"]["Enums"]["tipo_contacto_caso"]
            | null
          reactivacion_propuesta_at: string | null
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
          puntuacion?: number
          puntuacion_at?: string | null
          quien_contacta?:
            | Database["public"]["Enums"]["tipo_contacto_caso"]
            | null
          reactivacion_propuesta_at?: string | null
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
          puntuacion?: number
          puntuacion_at?: string | null
          quien_contacta?:
            | Database["public"]["Enums"]["tipo_contacto_caso"]
            | null
          reactivacion_propuesta_at?: string | null
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
      mensajes: {
        Row: {
          autor_id: string | null
          conversacion_id: string
          created_at: string
          cuerpo: string
          id: string
        }
        Insert: {
          autor_id?: string | null
          conversacion_id: string
          created_at?: string
          cuerpo: string
          id?: string
        }
        Update: {
          autor_id?: string | null
          conversacion_id?: string
          created_at?: string
          cuerpo?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_whatsapp: {
        Row: {
          anuncio_ref: string | null
          anuncio_titulo: string | null
          created_at: string
          cuerpo: string | null
          direccion: string
          id: string
          lead_id: string | null
          mensaje_ref: string | null
          procesado_at: string | null
          recibido_at: string
          telefono: string
        }
        Insert: {
          anuncio_ref?: string | null
          anuncio_titulo?: string | null
          created_at?: string
          cuerpo?: string | null
          direccion: string
          id?: string
          lead_id?: string | null
          mensaje_ref?: string | null
          procesado_at?: string | null
          recibido_at?: string
          telefono: string
        }
        Update: {
          anuncio_ref?: string | null
          anuncio_titulo?: string | null
          created_at?: string
          cuerpo?: string | null
          direccion?: string
          id?: string
          lead_id?: string | null
          mensaje_ref?: string | null
          procesado_at?: string | null
          recibido_at?: string
          telefono?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_whatsapp_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
          clave: string | null
          created_at: string
          email_enviado_at: string | null
          id: string
          lead_id: string | null
          leida_at: string | null
          mensaje: string
          push_enviado_at: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
          usuario_id: string
        }
        Insert: {
          clave?: string | null
          created_at?: string
          email_enviado_at?: string | null
          id?: string
          lead_id?: string | null
          leida_at?: string | null
          mensaje: string
          push_enviado_at?: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
          usuario_id: string
        }
        Update: {
          clave?: string | null
          created_at?: string
          email_enviado_at?: string | null
          id?: string
          lead_id?: string | null
          leida_at?: string | null
          mensaje?: string
          push_enviado_at?: string | null
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
      ocupaciones: {
        Row: {
          created_at: string
          created_by: string | null
          desde: string
          habitacion_id: string
          hasta: string | null
          id: string
          paciente_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          desde: string
          habitacion_id: string
          hasta?: string | null
          id?: string
          paciente_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          desde?: string
          habitacion_id?: string
          hasta?: string | null
          id?: string
          paciente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocupaciones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocupaciones_habitacion_id_fkey"
            columns: ["habitacion_id"]
            isOneToOne: false
            referencedRelation: "habitaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocupaciones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          adiccion_id: string | null
          centro_id: string
          created_at: string
          created_by: string | null
          email: string | null
          estado: Database["public"]["Enums"]["estado_paciente"]
          fase_id: string | null
          fecha_alta: string | null
          fecha_ingreso: string
          fecha_nacimiento: string | null
          id: string
          lead_id: string | null
          modalidad_id: string | null
          nombre: string
          notas: string | null
          telefono: string | null
          terapeuta_id: string | null
          updated_at: string
        }
        Insert: {
          adiccion_id?: string | null
          centro_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["estado_paciente"]
          fase_id?: string | null
          fecha_alta?: string | null
          fecha_ingreso?: string
          fecha_nacimiento?: string | null
          id?: string
          lead_id?: string | null
          modalidad_id?: string | null
          nombre: string
          notas?: string | null
          telefono?: string | null
          terapeuta_id?: string | null
          updated_at?: string
        }
        Update: {
          adiccion_id?: string | null
          centro_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["estado_paciente"]
          fase_id?: string | null
          fecha_alta?: string | null
          fecha_ingreso?: string
          fecha_nacimiento?: string | null
          id?: string
          lead_id?: string | null
          modalidad_id?: string | null
          nombre?: string
          notas?: string | null
          telefono?: string | null
          terapeuta_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_adiccion_id_fkey"
            columns: ["adiccion_id"]
            isOneToOne: false
            referencedRelation: "adicciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_fase_id_fkey"
            columns: ["fase_id"]
            isOneToOne: false
            referencedRelation: "fases_metodo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_modalidad_id_fkey"
            columns: ["modalidad_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_terapeuta_id_fkey"
            columns: ["terapeuta_id"]
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
          acceso_clinico: boolean
          activo: boolean
          created_at: string
          email: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Insert: {
          acceso_clinico?: boolean
          activo?: boolean
          created_at?: string
          email: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Update: {
          acceso_clinico?: boolean
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
      plantillas_email: {
        Row: {
          activa: boolean
          asunto: string
          created_at: string
          created_by: string | null
          cuerpo_html: string | null
          cuerpo_texto: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          asunto: string
          created_at?: string
          created_by?: string | null
          cuerpo_html?: string | null
          cuerpo_texto: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          asunto?: string
          created_at?: string
          created_by?: string | null
          cuerpo_html?: string | null
          cuerpo_texto?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plantillas_email_created_by_fkey"
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
      push_suscripciones: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          perfil_id: string
          ultimo_uso_at: string | null
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          perfil_id: string
          ultimo_uso_at?: string | null
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          perfil_id?: string
          ultimo_uso_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_suscripciones_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
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
      seguimientos_post_alta: {
        Row: {
          completado_at: string | null
          created_at: string
          fecha_prevista: string
          hito_meses: number
          id: string
          paciente_id: string
          resultado: string | null
        }
        Insert: {
          completado_at?: string | null
          created_at?: string
          fecha_prevista: string
          hito_meses: number
          id?: string
          paciente_id: string
          resultado?: string | null
        }
        Update: {
          completado_at?: string | null
          created_at?: string
          fecha_prevista?: string
          hito_meses?: number
          id?: string
          paciente_id?: string
          resultado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seguimientos_post_alta_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      series_factura: {
        Row: {
          ano: number
          centro_id: string
          id: string
          ultimo_numero: number
        }
        Insert: {
          ano: number
          centro_id: string
          id?: string
          ultimo_numero?: number
        }
        Update: {
          ano?: number
          centro_id?: string
          id?: string
          ultimo_numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "series_factura_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      sesiones: {
        Row: {
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["estado_sesion"]
          fin: string
          id: string
          inicio: string
          notas_clinicas: string | null
          paciente_id: string
          terapeuta_id: string | null
          tipo: Database["public"]["Enums"]["tipo_sesion"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["estado_sesion"]
          fin: string
          id?: string
          inicio: string
          notas_clinicas?: string | null
          paciente_id: string
          terapeuta_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_sesion"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["estado_sesion"]
          fin?: string
          id?: string
          inicio?: string
          notas_clinicas?: string | null
          paciente_id?: string
          terapeuta_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_sesion"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sesiones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_terapeuta_id_fkey"
            columns: ["terapeuta_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas: {
        Row: {
          completada_at: string | null
          completada_por: string | null
          created_at: string
          id: string
          lead_id: string
          responsable_id: string | null
          titulo: string
          vence_at: string
        }
        Insert: {
          completada_at?: string | null
          completada_por?: string | null
          created_at?: string
          id?: string
          lead_id: string
          responsable_id?: string | null
          titulo: string
          vence_at: string
        }
        Update: {
          completada_at?: string | null
          completada_por?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          responsable_id?: string | null
          titulo?: string
          vence_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_completada_por_fkey"
            columns: ["completada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
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
      agenda_citas: {
        Args: { desde: string; hasta: string }
        Returns: {
          centro_id: string
          centro_nombre: string
          contacto_id: string
          contacto_nombre: string
          contacto_telefono: string
          estado: Database["public"]["Enums"]["estado_cita"]
          fin: string
          id: string
          inicio: string
          lead_id: string
          lead_nombre: string
          lead_telefono: string
          modalidad_cita: Database["public"]["Enums"]["modalidad_cita"]
          notas: string
          profesional_id: string
          profesional_nombre: string
          tipo: Database["public"]["Enums"]["tipo_cita"]
        }[]
      }
      aviso_disponibilidad: {
        Args: { p_fin: string; p_inicio: string; p_profesional: string }
        Returns: string
      }
      darse_de_baja: { Args: { p_token: string }; Returns: boolean }
      es_direccion: { Args: never; Returns: boolean }
      mi_rol: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
      mis_centros: { Args: never; Returns: string[] }
      mis_conversaciones: { Args: never; Returns: string[] }
      mis_pacientes: { Args: never; Returns: string[] }
      profesionales_agendables: {
        Args: never
        Returns: {
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      siguiente_numero_factura: {
        Args: { p_ano: number; p_centro: string }
        Returns: string
      }
      tiene_acceso_clinico: { Args: never; Returns: boolean }
    }
    Enums: {
      estado_campana:
        | "borrador"
        | "programada"
        | "enviando"
        | "enviada"
        | "cancelada"
      estado_cita: "programada" | "realizada" | "no_show" | "cancelada"
      estado_conversion: "pendiente_validacion" | "validada"
      estado_envio: "pendiente" | "enviado" | "fallido" | "rebotado"
      estado_factura: "borrador" | "emitida" | "cobrada" | "anulada"
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
      estado_paciente: "activo" | "alta" | "abandono" | "derivado_externo"
      estado_presupuesto: "propuesto" | "aceptado" | "rechazado"
      estado_sesion: "programada" | "realizada" | "no_show" | "cancelada"
      metodo_cobro:
        | "transferencia"
        | "tarjeta"
        | "efectivo"
        | "domiciliacion"
        | "otro"
      modalidad_cita: "presencial" | "videollamada" | "telefonica"
      rol_usuario: "direccion" | "admisiones" | "terapeuta" | "administracion"
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
      tipo_documento_clinico:
        | "consentimiento"
        | "informe"
        | "derivacion"
        | "otro"
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
        | "riesgo_recaida"
        | "seguimiento_post_alta"
        | "campana_finalizada"
        | "mensaje_chat"
      tipo_sesion: "individual" | "grupal" | "familiar"
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
      estado_campana: [
        "borrador",
        "programada",
        "enviando",
        "enviada",
        "cancelada",
      ],
      estado_cita: ["programada", "realizada", "no_show", "cancelada"],
      estado_conversion: ["pendiente_validacion", "validada"],
      estado_envio: ["pendiente", "enviado", "fallido", "rebotado"],
      estado_factura: ["borrador", "emitida", "cobrada", "anulada"],
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
      estado_paciente: ["activo", "alta", "abandono", "derivado_externo"],
      estado_presupuesto: ["propuesto", "aceptado", "rechazado"],
      estado_sesion: ["programada", "realizada", "no_show", "cancelada"],
      metodo_cobro: [
        "transferencia",
        "tarjeta",
        "efectivo",
        "domiciliacion",
        "otro",
      ],
      modalidad_cita: ["presencial", "videollamada", "telefonica"],
      rol_usuario: ["direccion", "admisiones", "terapeuta", "administracion"],
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
      tipo_documento_clinico: [
        "consentimiento",
        "informe",
        "derivacion",
        "otro",
      ],
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
        "riesgo_recaida",
        "seguimiento_post_alta",
        "campana_finalizada",
        "mensaje_chat",
      ],
      tipo_sesion: ["individual", "grupal", "familiar"],
      urgencia_lead: ["alta", "media", "baja"],
    },
  },
} as const
