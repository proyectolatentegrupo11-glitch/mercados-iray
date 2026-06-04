import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

/* ============================================================================
   MERCADOS IRAY · INVENTARIO DIGITAL  (React + Vite, listo para Vercel)
   ----------------------------------------------------------------------------
   Filosofía: OFFLINE-FIRST.
   - La fuente de verdad es localStorage (funciona sin internet).
   - Supabase es OPCIONAL: si hay variables VITE_SUPABASE_* configuradas y
     hay conexión, sincroniza el inventario en la nube. Si no, no pasa nada.
   ========================================================================== */

/* ----------------------------------------------------------------------------
   CIRCUITO 0 · CLIENTE SUPABASE (opcional)
---------------------------------------------------------------------------- */
const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  SB_URL && SB_KEY && SB_URL.startsWith("http")
    ? createClient(SB_URL, SB_KEY)
    : null; // null => modo solo-offline

/* ----------------------------------------------------------------------------
   CIRCUITO 1 · MOTOR DE TEMAS (claro / oscuro)
---------------------------------------------------------------------------- */
const THEMES = {
  light: {
    bg: "#F6EFE3",
    bg2: "#EFE6D6",
    bg3: "#FCF8F0",
    card: "#FFFFFFF2",
    border: "#E2D5BD",
    text: "#3A2E24",
    muted: "#8B7B68",
    accent: "#C0654E",
    accentSoft: "#F6E2DB",
    positive: "#4F8A5B",
    positiveSoft: "#E3F0E4",
    warning: "#D9A441",
    warningSoft: "#FBEFD4",
    negative: "#C0654E",
    info: "#3E7D8A",
    orb1: "#C0654E22",
    orb2: "#4F8A5B22",
    dot: "#00000008",
  },
  dark: {
    bg: "#221B15",
    bg2: "#2A211B",
    bg3: "#2F261F",
    card: "#312820F2",
    border: "#43372C",
    text: "#F3E9DA",
    muted: "#A38F78",
    accent: "#E08368",
    accentSoft: "#3A2620",
    positive: "#6FB57C",
    positiveSoft: "#21321F",
    warning: "#E5B85A",
    warningSoft: "#39301A",
    negative: "#E08368",
    info: "#63B0BE",
    orb1: "#E0836833",
    orb2: "#6FB57C2A",
    dot: "#FFFFFF08",
  },
};

const FONTS = {
  display: "'Fraunces', Georgia, serif",
  body: "'Plus Jakarta Sans', system-ui, sans-serif",
  mono: "'DM Mono', 'Courier New', monospace",
};

/* ----------------------------------------------------------------------------
   CIRCUITO 2 · UTILIDADES
---------------------------------------------------------------------------- */
const LLAVE = "iray_productos_v1";
const LLAVE_TEMA = "iray_tema";

const pesos = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const hoyISO = () => new Date().toISOString().slice(0, 10);

const fmtFecha = (iso) => {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

// Estado de vencimiento -> color semáforo
function estadoVencimiento(vence) {
  if (!vence) return { tipo: "sinfecha", dias: null, texto: "Sin fecha" };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fv = new Date(vence + "T00:00:00");
  const dias = Math.round((fv - hoy) / 86400000);
  if (dias < 0) return { tipo: "vencido", dias, texto: "Vencido" };
  if (dias <= 30) return { tipo: "porvencer", dias, texto: `Vence en ${dias} día(s)` };
  return { tipo: "ok", dias, texto: "A tiempo" };
}

/* ----------------------------------------------------------------------------
   CIRCUITO 3 · COMPONENTE PRINCIPAL
---------------------------------------------------------------------------- */
export default function App() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem(LLAVE_TEMA) || "light"
  );
  const t = THEMES[theme];

  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDeb, setBusquedaDeb] = useState("");
  const [show, setShow] = useState(false); // animación de entrada
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [toast, setToast] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);

  const formInicial = {
    nombre: "",
    codigo: "",
    cantidad: "",
    costo: "",
    precio: "",
    vence: "",
  };
  const [form, setForm] = useState(formInicial);

  /* ---- Fuentes (inyección dinámica, igual patrón de la skill) ---- */
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap";
    document.head.appendChild(l);
    return () => {
      document.head.removeChild(l);
    };
  }, []);

  /* ---- Persistir tema ---- */
  useEffect(() => {
    localStorage.setItem(LLAVE_TEMA, theme);
    document.body.style.background = THEMES[theme].bg;
  }, [theme]);

  /* ---- Toast helper ---- */
  const avisar = useCallback((texto, tipo = "ok") => {
    setToast({ texto, tipo, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  /* ---- Debounce de búsqueda (300ms) ---- */
  useEffect(() => {
    const id = setTimeout(() => setBusquedaDeb(busqueda.toLowerCase().trim()), 300);
    return () => clearTimeout(id);
  }, [busqueda]);

  /* ---- Guardado local (fuente de verdad) ---- */
  const guardarLocal = useCallback((lista) => {
    localStorage.setItem(LLAVE, JSON.stringify(lista));
  }, []);

  /* ---- Carga inicial: localStorage + (si hay) Supabase ---- */
  useEffect(() => {
    let locales = [];
    try {
      locales = JSON.parse(localStorage.getItem(LLAVE)) || [];
    } catch {
      locales = [];
    }
    setProductos(locales);
    setCargando(false);
    requestAnimationFrame(() => setShow(true));

    // Intento de sincronización con Supabase (no bloquea la UI)
    if (supabase) {
      (async () => {
        try {
          const { data, error } = await supabase
            .from("productos")
            .select("*")
            .order("vence", { ascending: true });
          if (!error && Array.isArray(data) && data.length) {
            setProductos(data);
            guardarLocal(data);
          }
        } catch {
          /* sin conexión: seguimos con los datos locales */
        }
      })();
    }
  }, [guardarLocal]);

  /* ---- Sincronizar un producto a Supabase (si está configurado) ---- */
  const sincronizarUpsert = useCallback(async (prod) => {
    if (!supabase) return;
    try {
      setSincronizando(true);
      await supabase.from("productos").upsert(prod);
    } catch {
      /* offline: quedará solo en local */
    } finally {
      setSincronizando(false);
    }
  }, []);
  const sincronizarBorrado = useCallback(async (id) => {
    if (!supabase) return;
    try {
      setSincronizando(true);
      await supabase.from("productos").delete().eq("id", id);
    } catch {
      /* offline */
    } finally {
      setSincronizando(false);
    }
  }, []);

  /* ---- CRUD ---- */
  const abrirAgregar = () => {
    setEditandoId(null);
    setForm(formInicial);
    setModalAbierto(true);
  };
  const abrirEditar = (p) => {
    setEditandoId(p.id);
    setForm({
      nombre: p.nombre,
      codigo: p.codigo || "",
      cantidad: String(p.cantidad),
      costo: String(p.costo),
      precio: String(p.precio),
      vence: p.vence || "",
    });
    setModalAbierto(true);
  };
  const cerrarModal = () => {
    setModalAbierto(false);
    apagarCamara();
  };

  const guardarProducto = () => {
    const nombre = form.nombre.trim();
    const cantidad = parseFloat(form.cantidad);
    const costo = parseFloat(form.costo);
    const precio = parseFloat(form.precio);

    if (!nombre) return avisar("Escribe el nombre del producto", "warn");
    if (isNaN(cantidad) || cantidad < 0) return avisar("Cantidad no válida", "warn");
    if (isNaN(costo) || costo < 0) return avisar("Costo no válido", "warn");
    if (isNaN(precio) || precio < 0) return avisar("Precio no válido", "warn");

    let lista;
    let prod;
    if (editandoId) {
      prod = {
        id: editandoId,
        nombre,
        codigo: form.codigo.trim(),
        cantidad,
        costo,
        precio,
        vence: form.vence || null,
      };
      lista = productos.map((p) => (p.id === editandoId ? prod : p));
      avisar("Producto actualizado");
    } else {
      prod = {
        id:
          (typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now())),
        nombre,
        codigo: form.codigo.trim(),
        cantidad,
        costo,
        precio,
        vence: form.vence || null,
      };
      lista = [...productos, prod];
      avisar("Producto agregado");
    }
    setProductos(lista);
    guardarLocal(lista);
    sincronizarUpsert(prod);
    cerrarModal();
  };

  const borrarProducto = (id) => {
    if (!window.confirm("¿Seguro que quieres eliminar este producto?")) return;
    const lista = productos.filter((p) => p.id !== id);
    setProductos(lista);
    guardarLocal(lista);
    sincronizarBorrado(id);
    avisar("Producto eliminado");
  };

  /* ---- Lista filtrada + ordenada por vencimiento ---- */
  const listaVista = useMemo(() => {
    let l = [...productos].sort((a, b) => {
      const va = a.vence || "9999-12-31";
      const vb = b.vence || "9999-12-31";
      return va.localeCompare(vb);
    });
    if (busquedaDeb) {
      l = l.filter(
        (p) =>
          p.nombre.toLowerCase().includes(busquedaDeb) ||
          (p.codigo || "").toLowerCase().includes(busquedaDeb)
      );
    }
    return l;
  }, [productos, busquedaDeb]);

  /* ---- KPIs ---- */
  const kpis = useMemo(() => {
    let valor = 0,
      alertas = 0;
    productos.forEach((p) => {
      valor += (Number(p.cantidad) || 0) * (Number(p.costo) || 0);
      const e = estadoVencimiento(p.vence);
      if (e.tipo === "vencido" || e.tipo === "porvencer") alertas++;
    });
    return { valor, alertas, total: productos.length };
  }, [productos]);

  /* ---- Exportar CSV ---- */
  const exportarCSV = () => {
    if (!productos.length) return avisar("No hay productos para exportar", "warn");
    const cab = ["Producto", "Codigo", "Cantidad", "Costo", "Precio", "Vence"];
    const filas = productos.map((p) =>
      [p.nombre, p.codigo || "", p.cantidad, p.costo, p.precio, p.vence || ""]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = "\uFEFF" + [cab.join(","), ...filas].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventario-iray-${hoyISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    avisar("Inventario exportado a CSV");
  };

  /* --------------------------------------------------------------------------
     CIRCUITO 4 · LECTOR DE CÓDIGO DE BARRAS (cámara con BarcodeDetector)
     USB no necesita código: funciona como teclado sobre la casilla.
  -------------------------------------------------------------------------- */
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const escaneandoRef = useRef(false);
  const [camaraOn, setCamaraOn] = useState(false);
  const [estadoCam, setEstadoCam] = useState("");

  const apagarCamara = useCallback(() => {
    escaneandoRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    setCamaraOn(false);
  }, []);

  const alternarCamara = async () => {
    if (camaraOn) return apagarCamara();
    if (!("BarcodeDetector" in window)) {
      avisar("Este equipo no soporta cámara. Usa lector USB o escribe el código.", "warn");
      return;
    }
    try {
      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"],
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCamaraOn(true);
      setEstadoCam("Apunta la cámara al código…");
      escaneandoRef.current = true;
      // esperar a que el <video> exista
      requestAnimationFrame(async () => {
        if (videoRef.current) videoRef.current.srcObject = stream;
        const bucle = async () => {
          if (!escaneandoRef.current || !videoRef.current) return;
          try {
            const cods = await detector.detect(videoRef.current);
            if (cods.length) {
              const v = cods[0].rawValue;
              setForm((f) => ({ ...f, codigo: v }));
              setEstadoCam("✓ Código leído: " + v);
              avisar("Código leído: " + v);
              apagarCamara();
              return;
            }
          } catch {
            /* reintentar */
          }
          setTimeout(() => requestAnimationFrame(bucle), 300);
        };
        bucle();
      });
    } catch {
      avisar("No se pudo abrir la cámara. Revisa permisos.", "warn");
    }
  };

  useEffect(() => () => apagarCamara(), [apagarCamara]);

  /* --------------------------------------------------------------------------
     CIRCUITO 5 · ESTILOS REUTILIZABLES (inline)
  -------------------------------------------------------------------------- */
  const card = {
    background: t.card,
    border: `1px solid ${t.border}`,
    borderRadius: 20,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    boxShadow:
      theme === "dark"
        ? "0 8px 30px rgba(0,0,0,.35)"
        : "0 8px 30px rgba(91,74,58,.10)",
  };
  const inputStyle = {
    width: "100%",
    padding: "13px 14px",
    fontSize: 16,
    fontFamily: FONTS.body,
    color: t.text,
    background: theme === "dark" ? "#00000022" : "#FFFFFF",
    border: `1.5px solid ${t.border}`,
    borderRadius: 12,
    outline: "none",
  };
  const labelStyle = {
    display: "block",
    fontWeight: 700,
    fontSize: 14,
    marginBottom: 6,
    color: t.text,
  };
  const btn = (bg, color = "#fff") => ({
    border: "none",
    borderRadius: 12,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 800,
    fontFamily: FONTS.body,
    cursor: "pointer",
    color,
    background: bg,
    transition: "transform .12s, filter .2s",
  });

  const semColor = (tipo) =>
    tipo === "vencido"
      ? t.negative
      : tipo === "porvencer"
      ? t.warning
      : tipo === "ok"
      ? t.positive
      : t.muted;

  /* ==========================================================================
     RENDER
  ========================================================================== */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.text,
        fontFamily: FONTS.body,
        position: "relative",
        overflowX: "hidden",
        transition: "background .4s, color .4s",
      }}
    >
      {/* Resets globales + fondo decorativo + scrollbar */}
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 8px; }
        input::placeholder { color: ${t.muted}; opacity: .8; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .row-hover:hover td { background: ${t.bg2} !important; }
        .lift { transition: transform .18s ease, box-shadow .18s ease; }
        .lift:hover { transform: translateY(-4px); }
        .press:active { transform: scale(.97); }
      `}</style>

      {/* Orbes radiales de profundidad */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: `radial-gradient(${t.dot} 1px, transparent 1px)`,
          backgroundSize: "22px 22px",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "-10%",
          right: "-8%",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${t.orb1}, transparent 70%)`,
          filter: "blur(20px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: "-12%",
          left: "-10%",
          width: 460,
          height: 460,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${t.orb2}, transparent 70%)`,
          filter: "blur(20px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ---- HEADER pegajoso con blur ---- */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: theme === "dark" ? "#221B15CC" : "#F6EFE3CC",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                background: t.accent,
                display: "grid",
                placeItems: "center",
                fontSize: 24,
                boxShadow: `0 0 22px ${t.accent}55`,
              }}
            >
              🛒
            </div>
            <div>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 26,
                  fontWeight: 600,
                  lineHeight: 1,
                  letterSpacing: ".3px",
                }}
              >
                Mercados IRAY
              </div>
              <div style={{ fontSize: 13, color: t.muted, marginTop: 3 }}>
                Inventario · {supabase ? "nube + offline" : "funciona sin internet"}
                {sincronizando && (
                  <span style={{ color: t.info }}> · sincronizando…</span>
                )}
              </div>
            </div>
          </div>

          <button
            className="press"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            style={{
              ...btn(theme === "dark" ? t.bg3 : "#FFFFFF", t.text),
              border: `1.5px solid ${t.border}`,
              padding: "11px 16px",
              fontSize: 15,
            }}
            title="Cambiar tema"
          >
            {theme === "dark" ? "☀️ Claro" : "🌙 Oscuro"}
          </button>
        </div>
      </header>

      {/* ---- CONTENIDO ---- */}
      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "24px 20px 80px",
          position: "relative",
          zIndex: 1,
          opacity: show ? 1 : 0,
          transform: show ? "translateY(0)" : "translateY(30px)",
          transition: "all .7s cubic-bezier(0.34, 1.2, 0.64, 1)",
        }}
      >
        {/* KPIs */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
            marginBottom: 22,
          }}
        >
          <KpiCard
            t={t}
            card={card}
            color={t.info}
            etiqueta="Valor total del inventario"
            valor={pesos(kpis.valor)}
            mono
          />
          <KpiCard
            t={t}
            card={card}
            color={t.accent}
            etiqueta="Productos registrados"
            valor={kpis.total}
            mono
          />
          <KpiCard
            t={t}
            card={card}
            color={kpis.alertas ? t.warning : t.positive}
            etiqueta="Por vencer / vencidos"
            valor={kpis.alertas}
            mono
            glow={kpis.alertas > 0}
          />
        </section>

        {/* Barra de acciones */}
        <section
          style={{
            ...card,
            padding: 18,
            marginBottom: 22,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <span
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 17,
              }}
            >
              🔎
            </span>
            <input
              style={{ ...inputStyle, paddingLeft: 42 }}
              placeholder="Buscar por nombre o código…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <button
            className="press"
            style={btn(t.positive)}
            onClick={abrirAgregar}
          >
            ➕ Agregar producto
          </button>
          <button
            className="press"
            style={{ ...btn("transparent", t.text), border: `1.5px solid ${t.border}` }}
            onClick={exportarCSV}
          >
            ⬇️ Exportar CSV
          </button>
        </section>

        {/* Tabla / estados */}
        <section style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: `1px solid ${t.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <h2
              style={{
                fontFamily: FONTS.display,
                fontWeight: 600,
                fontSize: 21,
                margin: 0,
              }}
            >
              Productos
            </h2>
            <span style={{ fontSize: 13, color: t.muted, fontFamily: FONTS.mono }}>
              {listaVista.length} mostrados
            </span>
          </div>

          {cargando ? (
            <Estado t={t}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  border: `3px solid ${t.border}`,
                  borderTopColor: t.accent,
                  borderRadius: "50%",
                  animation: "spin .8s linear infinite",
                  margin: "0 auto 12px",
                }}
              />
              Cargando inventario…
            </Estado>
          ) : listaVista.length === 0 ? (
            <Estado t={t}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>📦</div>
              {busquedaDeb
                ? "No se encontraron productos con esa búsqueda."
                : "Aún no hay productos. Pulsa “Agregar producto”."}
            </Estado>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 720,
                }}
              >
                <thead>
                  <tr>
                    {["Producto", "Código", "Cant.", "Costo", "Precio", "Vence", "Estado", ""].map(
                      (h, i) => (
                        <th
                          key={i}
                          style={{
                            textAlign: i >= 2 && i <= 5 ? "right" : "left",
                            padding: "12px 16px",
                            fontSize: 12,
                            letterSpacing: ".6px",
                            textTransform: "uppercase",
                            color: t.muted,
                            borderBottom: `1px solid ${t.border}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {listaVista.map((p) => {
                    const e = estadoVencimiento(p.vence);
                    const c = semColor(e.tipo);
                    return (
                      <tr
                        key={p.id}
                        className="row-hover"
                        style={{ borderBottom: `1px solid ${t.border}` }}
                      >
                        <td style={{ padding: "12px 16px", fontWeight: 700 }}>
                          {p.nombre}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            fontFamily: FONTS.mono,
                            color: t.muted,
                            fontSize: 14,
                          }}
                        >
                          {p.codigo || "—"}
                        </td>
                        <td style={tdNum(t)}>{p.cantidad}</td>
                        <td style={tdNum(t)}>{pesos(p.costo)}</td>
                        <td style={tdNum(t)}>{pesos(p.precio)}</td>
                        <td style={{ ...tdNum(t), color: t.muted }}>
                          {fmtFecha(p.vence)}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 7,
                              padding: "5px 11px",
                              borderRadius: 20,
                              fontSize: 12.5,
                              fontWeight: 700,
                              color: c,
                              background: c + "1F",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: c,
                                boxShadow: `0 0 8px ${c}`,
                              }}
                            />
                            {e.texto}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              className="press"
                              onClick={() => abrirEditar(p)}
                              style={iconBtn(t.warning + "22", t.warning)}
                              title="Editar"
                            >
                              ✏️
                            </button>
                            <button
                              className="press"
                              onClick={() => borrarProducto(p.id)}
                              style={iconBtn(t.negative + "22", t.negative)}
                              title="Eliminar"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Nota de ayuda */}
        <p
          style={{
            marginTop: 18,
            fontSize: 13.5,
            color: t.muted,
            lineHeight: 1.6,
          }}
        >
          💡 Las filas con punto <b style={{ color: t.warning }}>amarillo</b> vencen en 30 días o
          menos, y las de punto <b style={{ color: t.negative }}>rojo</b> ya vencieron. Todo se
          guarda en este dispositivo automáticamente; {supabase ? "y se sincroniza en la nube cuando hay internet." : "no necesita conexión."}
        </p>
      </main>

      {/* ---- MODAL agregar/editar ---- */}
      {modalAbierto && (
        <div
          onClick={(e) => e.target === e.currentTarget && cerrarModal()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(30,22,16,.55)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: 18,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              ...card,
              width: "100%",
              maxWidth: 540,
              marginTop: 30,
              padding: 24,
              animation: "none",
            }}
          >
            <h3
              style={{
                fontFamily: FONTS.display,
                fontWeight: 600,
                fontSize: 22,
                margin: "0 0 18px",
              }}
            >
              {editandoId ? "Editar producto" : "Agregar producto"}
            </h3>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Nombre del producto</label>
              <input
                style={inputStyle}
                placeholder="Ej: Arroz Diana 500g"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                Código de barras{" "}
                <span style={{ fontWeight: 400, color: t.muted }}>(opcional · USB o cámara)</span>
              </label>
              <input
                style={inputStyle}
                placeholder="Pasa el lector USB o usa la cámara"
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              />
              <button
                className="press"
                onClick={alternarCamara}
                style={{
                  ...btn("transparent", t.text),
                  border: `1.5px solid ${t.border}`,
                  marginTop: 8,
                  padding: "10px 14px",
                  fontSize: 14,
                }}
              >
                📷 {camaraOn ? "Cerrar cámara" : "Escanear con cámara"}
              </button>
              {camaraOn && (
                <div style={{ marginTop: 10, textAlign: "center" }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      maxWidth: 360,
                      borderRadius: 12,
                      border: `3px solid ${t.accent}`,
                      background: "#000",
                    }}
                  />
                  <p style={{ fontSize: 13, color: t.muted, marginTop: 6 }}>{estadoCam}</p>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <div style={{ flex: "1 1 140px" }}>
                <label style={labelStyle}>Cantidad</label>
                <input
                  type="number"
                  min="0"
                  style={inputStyle}
                  placeholder="Ej: 24"
                  value={form.cantidad}
                  onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label style={labelStyle}>Costo unitario ($)</label>
                <input
                  type="number"
                  min="0"
                  style={inputStyle}
                  placeholder="Ej: 1800"
                  value={form.costo}
                  onChange={(e) => setForm({ ...form, costo: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
              <div style={{ flex: "1 1 140px" }}>
                <label style={labelStyle}>Precio de venta ($)</label>
                <input
                  type="number"
                  min="0"
                  style={inputStyle}
                  placeholder="Ej: 2500"
                  value={form.precio}
                  onChange={(e) => setForm({ ...form, precio: e.target.value })}
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label style={labelStyle}>Fecha de vencimiento</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={form.vence}
                  onChange={(e) => setForm({ ...form, vence: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button className="press" style={{ ...btn(t.positive), flex: 1 }} onClick={guardarProducto}>
                ✅ Guardar
              </button>
              <button
                className="press"
                style={{ ...btn("transparent", t.text), border: `1.5px solid ${t.border}`, flex: 1 }}
                onClick={cerrarModal}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- TOAST ---- */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 26,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            background:
              toast.tipo === "warn" ? t.warning : toast.tipo === "ok" ? t.text : t.text,
            color: theme === "dark" && toast.tipo !== "warn" ? t.bg : "#FFF",
            padding: "13px 22px",
            borderRadius: 30,
            fontWeight: 700,
            fontSize: 14.5,
            boxShadow: "0 10px 30px rgba(0,0,0,.3)",
            maxWidth: "90%",
            textAlign: "center",
          }}
        >
          {toast.tipo === "warn" ? "⚠️ " : "✅ "}
          {toast.texto}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   CIRCUITO 6 · COMPONENTES AUXILIARES
---------------------------------------------------------------------------- */
function KpiCard({ t, card, color, etiqueta, valor, mono, glow }) {
  return (
    <div
      className="lift"
      style={{
        ...card,
        padding: 20,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 4,
          background: color,
          boxShadow: glow ? `0 0 20px ${color}` : "none",
        }}
      />
      <div style={{ fontSize: 13.5, color: t.muted, marginBottom: 8 }}>{etiqueta}</div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          fontFamily: mono ? FONTS.mono : FONTS.body,
          color,
          textShadow: glow ? `0 0 18px ${color}66` : "none",
        }}
      >
        {valor}
      </div>
    </div>
  );
}

function Estado({ t, children }) {
  return (
    <div
      style={{
        padding: "54px 20px",
        textAlign: "center",
        color: t.muted,
        fontSize: 15,
        fontStyle: "italic",
      }}
    >
      {children}
    </div>
  );
}

const tdNum = (t) => ({
  padding: "12px 16px",
  textAlign: "right",
  fontFamily: FONTS.mono,
  fontSize: 14.5,
  whiteSpace: "nowrap",
  color: t.text,
});

const iconBtn = (bg, color) => ({
  border: "none",
  borderRadius: 9,
  padding: "8px 11px",
  fontSize: 15,
  cursor: "pointer",
  background: bg,
  color,
});
