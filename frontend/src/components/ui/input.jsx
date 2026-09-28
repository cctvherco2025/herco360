import * as React from "react"

import { cn } from "@/lib/utils"

// Tipos que abren un selector nativo del navegador (calendario / reloj).
const PICKER_TYPES = new Set(["date", "time", "datetime-local", "month", "week"])

const Input = React.forwardRef(({ className, type, onClick, ...props }, ref) => {
  // En algunos celulares (visto en Chrome 154 / Android dentro de ventanas
  // modales) el toque llega al campo pero el navegador ya no despliega el
  // selector de fecha/hora por sí solo. Se lo pedimos explícitamente con
  // showPicker(); si el navegador ya lo abrió o no lo permite, se ignora.
  const handleClick = (e) => {
    onClick?.(e)
    const el = e.currentTarget
    if (e.defaultPrevented || !PICKER_TYPES.has(type) || el.disabled || el.readOnly) return
    try { el.showPicker?.() } catch (err) { /* ya abierto o no soportado */ }
  }
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      onClick={handleClick}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
