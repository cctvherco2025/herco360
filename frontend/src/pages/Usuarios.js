import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Shield, UserCog, Clock, Mail } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { timeAgoEs } from '@/lib/time';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function Usuarios() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [users, setUsers] = useState([]);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/users'); setUsers(data); } catch (e) {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const pending = users.filter((u) => u.status === 'pending');
  const approved = users.filter((u) => u.status === 'approved');

  const approve = async (id) => { try { await api.post(`/users/${id}/approve`); toast.success('Usuario aprobado'); load(); } catch (e) { toast.error('Error'); } };
  const reject = async (id) => { try { await api.post(`/users/${id}/reject`); toast.success('Usuario rechazado'); load(); } catch (e) { toast.error('Error'); } };
  const setRole = async (id, role) => { try { await api.patch(`/users/${id}/role`, { role }); toast.success('Rol actualizado'); load(); } catch (e) { toast.error('Error'); } };

  return (
    <div className="max-w-[1320px] mx-auto pt-2">
      <div className="mb-5">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold">Usuarios</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{isAdmin ? 'Aprueba solicitudes y administra el equipo' : 'Directorio del equipo HERCO'}</p>
      </div>

      {isAdmin && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="rounded-[18px] bg-card border shadow-card p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-[#ec9032]" />
            <h2 className="font-heading text-lg font-semibold">Solicitudes pendientes</h2>
            {pending.length > 0 && <span className="rounded-full bg-[rgba(236,144,50,0.14)] text-[#ec9032] text-xs font-semibold px-2 py-0.5">{pending.length}</span>}
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay solicitudes pendientes</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {pending.map((u) => (
                <div key={u.id} className="rounded-xl border p-4 flex items-center gap-3" data-testid="pending-user-card">
                  <Avatar className="h-11 w-11 border"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.name?.[0]}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.position} · {timeAgoEs(u.created_at)}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => approve(u.id)} className="h-9 w-9 grid place-items-center rounded-lg bg-[rgba(22,163,74,0.12)] text-[#16a34a] hover:bg-[rgba(22,163,74,0.22)]" data-testid="approve-user-button"><Check className="h-4 w-4" /></button>
                    <button onClick={() => reject(u.id)} className="h-9 w-9 grid place-items-center rounded-lg bg-[rgba(220,38,38,0.1)] text-[#dc2626] hover:bg-[rgba(220,38,38,0.2)]" data-testid="reject-user-button"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}
        className="rounded-[18px] bg-card border shadow-card p-5">
        <h2 className="font-heading text-lg font-semibold mb-4">Equipo ({approved.length})</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {approved.map((u) => (
            <div key={u.id} className="rounded-xl border p-4 hover:shadow-card transition-shadow" data-testid="user-card">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 border"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.name?.[0]}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.position}{u.area ? ` · ${u.area}` : ''}</p>
                </div>
                {u.role === 'admin'
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(30,57,94,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-[11px] font-semibold px-2 py-0.5"><Shield className="h-3 w-3" /> Admin</span>
                  : <span className="rounded-full bg-muted text-muted-foreground text-[11px] font-medium px-2 py-0.5">Usuario</span>}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" /> {u.email}</span>
                {isAdmin && u.id !== user?.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-xs text-[#00a5df] hover:underline inline-flex items-center gap-1" data-testid="user-role-menu"><UserCog className="h-3.5 w-3.5" /> Rol</button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl">
                      <DropdownMenuItem onClick={() => setRole(u.id, 'admin')}><Shield className="h-4 w-4 mr-2" /> Hacer administrador</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRole(u.id, 'user')}><UserCog className="h-4 w-4 mr-2" /> Hacer usuario</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
