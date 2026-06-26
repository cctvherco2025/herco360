import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowRight, Mail, Lock, KeyRound } from 'lucide-react';
import api from '@/lib/api';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RecuperarPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 4) { toast.error('La contraseña debe tener al menos 4 caracteres'); return; }
    if (password !== confirm) { toast.error('Las contraseñas no coinciden'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, new_password: password });
      toast.success('Contraseña actualizada. Ya puedes iniciar sesión.');
      navigate('/login');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo actualizar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 auth-bg">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden">
        <Logo size="lg" />
        <div className="max-w-md">
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="font-heading text-5xl font-semibold text-[#1e395e] leading-[1.05]">
            Recupera tu acceso a <span className="text-[#00a5df]">HERCO360</span>.
          </motion.h1>
          <p className="mt-5 text-[#5b667a] text-lg">
            Define una nueva contraseña para tu cuenta corporativa y vuelve a tu espacio de trabajo.
          </p>
        </div>
        <p className="text-sm text-[#8a8b8b]">© 2026 HERCO — Plataforma Corporativa HERCO360</p>
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
              <p className="text-sm text-muted-foreground">Ingresa tu correo y define una nueva</p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo corporativo</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" data-testid="recover-email-input" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="nombre@herco.com" className="pl-10 h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Nueva contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" data-testid="recover-password-input" type={show ? 'text' : 'password'} required value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 4 caracteres" className="pl-10 pr-10 h-11" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="confirm" data-testid="recover-confirm-input" type={show ? 'text' : 'password'} required value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} placeholder="Repite la contraseña" className="pl-10 h-11" />
              </div>
            </div>
            <Button type="submit" data-testid="recover-submit-button" disabled={loading}
              className="w-full h-11 bg-[#1e395e] hover:bg-[#162c49] text-white rounded-xl font-medium group">
              {loading ? 'Actualizando…' : <>Actualizar contraseña <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ¿Ya la recordaste?{' '}
            <Link to="/login" className="font-medium text-[#1e395e] dark:text-[#3cbef6] hover:underline">Iniciar sesión</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
