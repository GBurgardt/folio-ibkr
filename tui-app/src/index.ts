import {
  createCliRenderer,
  TextRenderable,
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents
} from "@opentui/core"

console.log("[FOLIO-TUI] Iniciando aplicación...")

async function main() {
  console.log("[FOLIO-TUI] Creando renderer...")

  const renderer = await createCliRenderer({
    consoleOptions: {
      sizePercent: 20,
    }
  })

  console.log("[FOLIO-TUI] Renderer creado exitosamente")

  // Caja principal del encabezado
  const header = new BoxRenderable(renderer, {
    id: "header",
    width: "100%",
    height: 3,
    backgroundColor: "#1a1a2e",
    borderStyle: "single",
    borderColor: "#4a9eff",
    position: "absolute",
    left: 0,
    top: 0,
  })

  // Título
  const title = new TextRenderable(renderer, {
    id: "title",
    content: "  FOLIO TUI - Interactive Brokers Portfolio Manager",
    fg: "#4a9eff",
    position: "absolute",
    left: 2,
    top: 1,
  })

  // Menú principal
  const menu = new SelectRenderable(renderer, {
    id: "main-menu",
    width: 40,
    height: 12,
    options: [
      { name: "Portfolio", description: "Ver posiciones actuales" },
      { name: "Orders", description: "Gestionar órdenes" },
      { name: "Market Data", description: "Datos de mercado en tiempo real" },
      { name: "Trading Bot", description: "Configurar bot de trading" },
      { name: "Settings", description: "Configuración de conexión" },
      { name: "Exit", description: "Salir de la aplicación" },
    ],
    position: "absolute",
    left: 2,
    top: 5,
    selectedColor: "#4a9eff",
    unselectedColor: "#666666",
  })

  // Descripción del item seleccionado
  const description = new TextRenderable(renderer, {
    id: "description",
    content: "Usa ↑↓ para navegar, Enter para seleccionar",
    fg: "#888888",
    position: "absolute",
    left: 2,
    top: 18,
  })

  // Status bar
  const statusBar = new TextRenderable(renderer, {
    id: "status",
    content: " [TWS: Desconectado] | Presiona 'q' para salir | '~' para consola",
    fg: "#666666",
    position: "absolute",
    left: 0,
    top: renderer.height - 1,
  })

  // Agregar elementos al root
  renderer.root.add(header)
  renderer.root.add(title)
  renderer.root.add(menu)
  renderer.root.add(description)
  renderer.root.add(statusBar)

  console.log("[FOLIO-TUI] Elementos UI agregados")

  // Manejar selección del menú
  menu.on(SelectRenderableEvents.ITEM_SELECTED, (index, option) => {
    console.log(`[FOLIO-TUI] Seleccionado: ${option.name}`)

    if (option.name === "Exit") {
      console.log("[FOLIO-TUI] Saliendo...")
      renderer.stop()
      process.exit(0)
    }

    // Por ahora solo mostramos mensaje
    description.content = `Seleccionaste: ${option.name} - ${option.description}`
  })

  // Manejar teclas
  renderer.keyInput.on("keypress", (key) => {
    console.log(`[FOLIO-TUI] Tecla presionada: ${key.name}`)

    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      console.log("[FOLIO-TUI] Saliendo por tecla...")
      renderer.stop()
      process.exit(0)
    }
  })

  // Focus en el menú
  menu.focus()

  console.log("[FOLIO-TUI] Iniciando render loop...")
  renderer.start()
}

main().catch((err) => {
  console.error("[FOLIO-TUI] Error fatal:", err)
  process.exit(1)
})
