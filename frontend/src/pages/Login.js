import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowRight, Mail, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Bienvenido a HERCO360');
      navigate('/');
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Error al iniciar sesión';
      if (err?.response?.status === 403) {
        toast.error(detail);
        if (detail.includes('pendiente')) navigate('/pending');
      } else {
        toast.error(detail);
      }
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
            La evolución digital de <span className="text-[#00a5df]">HERCO</span>.
          </motion.h1>
          <p className="mt-5 text-[#5b667a] text-lg">
            Agenda, Sala de Juntas y colaboración corporativa en una plataforma diseñada para tu equipo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {['Agenda inteligente', 'Sala de Juntas', 'Notificaciones'].map((t) => (
              <span key={t} className="rounded-full bg-white/70 backdrop-blur px-4 py-2 text-sm font-medium text-[#1e395e] shadow-card border border-white/60">{t}</span>
            ))}
          </div>
        </div>
        <p className="text-sm text-[#8a8b8b]">© 2026 HERCO — Plataforma Corporativa HERCO CCTV</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
          className="w-full max-w-md glass rounded-[24px] border border-white/60 dark:border-white/10 shadow-float p-8">
          <div className="lg:hidden mb-6 flex justify-center"><Logo size="md" /></div>
          <h2 className="font-heading text-2xl font-semibold text-foreground">Iniciar sesión</h2>
          <p className="text-sm text-muted-foreground mt-1">Accede a tu espacio de trabajo HERCO CCTV</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo corporativo</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" data-testid="login-email-input" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="nombre@herco.com" className="pl-10 h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" data-testid="login-password-input" type={show ? 'text' : 'password'} required value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-10 pr-10 h-11" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" data-testid="login-submit-button" disabled={loading}
              className="w-full h-11 bg-[#1e395e] hover:bg-[#162c49] text-white rounded-xl font-medium group">
              {loading ? 'Ingresando…' : <>Ingresar <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm">
            <Link to="/recuperar" data-testid="forgot-password-link" className="text-[#00a5df] hover:text-[#0093c7] hover:underline font-medium">¿Olvidaste tu contraseña?</Link>
          </p>

          <p className="mt-3 text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="font-medium text-[#1e395e] dark:text-[#3cbef6] hover:underline">Crear usuario</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
