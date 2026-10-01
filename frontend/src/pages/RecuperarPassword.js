import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, KeyRound } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

export default function RecuperarPassword() {
  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 auth-bg">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden">
        <Logo size="lg" />
        <div className="max-w-md">
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="font-heading text-5xl font-semibold text-[#1e395e] leading-[1.05]">
            Recupera tu acceso a <span className="text-[#00a5df]">HERCO CCTV</span>.
          </motion.h1>
          <p className="mt-5 text-[#5b667a] text-lg">
            Un administrador restablece tu contraseña y vuelves a tu espacio de trabajo.
          </p>
        </div>
        <p className="text-sm text-[#8a8b8b]">© 2026 HERCO — Plataforma Corporativa HERCO CCTV</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
          className="w-full max-w-md glass rounded-[24px] border border-white/60 dark:border-white/10 shadow-float p-8">
          <div className="lg:hidden mb-6 flex justify-center"><Logo size="md" /></div>
          <div className="flex items-center gap-2">
            <span className="h-10 w-10 grid place-items-center rounded-xl bg-[rgba(0,165,223,0.12)] text-[#00a5df]"><KeyRound className="h-5 w-5" /></span>
            <div>
              <h2 className="font-heading text-2xl font-semibold text-foreground">Recuperar contraseña</h2>
              <p className="text-sm text-muted-foreground">Te la restablece un administrador</p>
            </div>
          </div>

          <div className="mt-7 space-y-3 text-sm text-muted-foreground" data-testid="recover-info">
            <p>Por seguridad, la contraseña ya no se cambia desde aquí.</p>
            <p>
              Pide a un <span className="font-medium text-foreground">administrador</span> de HERCO360 que la restablezca
              desde <span className="font-medium text-foreground">Usuarios → Editar</span>. Después podrás cambiarla tú mismo
              en <span className="font-medium text-foreground">Configuración → Perfil</span>.
            </p>
          </div>
          <Button asChild className="mt-6 w-full h-11 bg-[#1e395e] hover:bg-[#162c49] text-white rounded-xl font-medium group">
            <Link to="/login">Volver a iniciar sesión <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link>
          </Button>

        </motion.div>
      </div>
    </div>
  );
}
