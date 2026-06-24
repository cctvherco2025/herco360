import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, LogOut, CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

export default function PendingApproval() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center p-6 auth-bg">
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
        className="w-full max-w-lg glass rounded-[24px] border border-white/60 dark:border-white/10 shadow-float p-10 text-center">
        <div className="flex justify-center mb-6"><Logo size="md" /></div>
        <div className="mx-auto h-16 w-16 rounded-full grid place-items-center bg-[rgba(236,144,50,0.14)] mb-5">
          <Clock className="h-8 w-8 text-[#ec9032]" />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(236,144,50,0.14)] px-3 py-1 text-xs font-semibold text-[#ec9032]">
          Pendiente de aprobación
        </span>
        <h2 className="font-heading text-2xl font-semibold text-foreground mt-4">Tu cuenta está en revisión</h2>
        <p className="text-muted-foreground mt-2">
          Un administrador de HERCO revisará tu solicitud. Recibirás acceso una vez que sea aprobada.
        </p>
        <div className="mt-6 space-y-2 text-left bg-card/60 rounded-2xl p-4 border">
          {['Solicitud recibida', 'En revisión por un administrador', 'Acceso habilitado'].map((s, i) => (
            <div key={s} className="flex items-center gap-3 text-sm">
              <CheckCircle2 className={`h-4 w-4 ${i === 0 ? 'text-[#16a34a]' : 'text-muted-foreground/40'}`} />
              <span className={i === 0 ? 'text-foreground' : 'text-muted-foreground'}>{s}</span>
            </div>
          ))}
        </div>
        <Button onClick={() => navigate('/login')} variant="outline" className="mt-7 rounded-xl" data-testid="pending-back-button">
          <LogOut className="h-4 w-4 mr-2" /> Volver al inicio de sesión
        </Button>
      </motion.div>
    </div>
  );
}
