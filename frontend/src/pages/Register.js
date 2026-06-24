import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowRight, Mail, Lock, User, Briefcase } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', position: '', password: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      toast.success('Solicitud enviada correctamente');
      navigate('/pending');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 auth-bg">
      <div className="hidden lg:flex flex-col justify-between p-12">
        <Logo size="lg" />
        <div className="max-w-md">
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="font-heading text-5xl font-semibold text-[#1e395e] leading-[1.05]">
            Únete al equipo <span className="text-[#00a5df]">HERCO</span>.
          </motion.h1>
          <p className="mt-5 text-[#5b667a] text-lg">
            Crea tu cuenta y un administrador la aprobará para darte acceso a la plataforma.
          </p>
        </div>
        <p className="text-sm text-[#8a8b8b]">© 2026 HERCO — Plataforma Corporativa HERCO360</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
          className="w-full max-w-md glass rounded-[24px] border border-white/60 dark:border-white/10 shadow-float p-8">
          <div className="lg:hidden mb-6 flex justify-center"><Logo size="md" /></div>
          <h2 className="font-heading text-2xl font-semibold text-foreground">Solicitar acceso</h2>
          <p className="text-sm text-muted-foreground mt-1">Registra tus datos para unirte a HERCO360</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="name" data-testid="register-name-input" required value={form.name} onChange={set('name')} placeholder="Tu nombre" className="pl-10 h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo corporativo</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" data-testid="register-email-input" type="email" required value={form.email} onChange={set('email')} placeholder="nombre@herco.com" className="pl-10 h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position">Cargo</Label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="position" data-testid="register-position-input" value={form.position} onChange={set('position')} placeholder="Ej. Analista Comercial" className="pl-10 h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" data-testid="register-password-input" type={show ? 'text' : 'password'} required value={form.password} onChange={set('password')} placeholder="Mínimo 4 caracteres" className="pl-10 pr-10 h-11" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" data-testid="register-submit-button" disabled={loading}
              className="w-full h-11 bg-[#1e395e] hover:bg-[#162c49] text-white rounded-xl font-medium group">
              {loading ? 'Enviando…' : <>Solicitar acceso <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="font-medium text-[#1e395e] dark:text-[#3cbef6] hover:underline">Iniciar sesión</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
