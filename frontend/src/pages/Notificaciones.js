import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCheck, UserPlus, UserCheck, CalendarPlus, UserX, Bookmark, Ban, Palmtree, CalendarCheck, CalendarX } from 'lucide-react';
import api from '@/lib/api';
import { timeAgoEs } from '@/lib/time';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

const ICONS = { UserPlus, UserCheck, CalendarPlus, UserX, Bookmark, Ban, Bell, Palmtree, CalendarCheck, CalendarX };

export default function Notificaciones() {
  const [notifs, setNotifs] = useState([]);
  const load = useCallback(async () => { try { const { data } = await api.get('/notifications'); setNotifs(data); } catch (e) {} }, []);
  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => { await api.post(`/notifications/${id}/read`); load(); };
  const markAll = async () => { await api.post('/notifications/read-all'); load(); };
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div className="max-w-[760px] mx-auto pt-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold">Notificaciones</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{unread > 0 ? `Tienes ${unread} sin leer` : 'Estás al día'}</p>
        </div>
        {unread > 0 && <Button variant="outline" onClick={markAll} className="rounded-xl" data-testid="notif-page-mark-all"><CheckCheck className="h-4 w-4 mr-1.5" /> Marcar todas</Button>}
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="rounded-[18px] bg-card border shadow-card overflow-hidden">
        {notifs.length === 0 && (
          <div className="py-16 text-center">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No tienes notificaciones</p>
          </div>
        )}
        {notifs.map((n) => {
          const Icon = ICONS[n.icon] || Bell;
          return (
            <button key={n.id} onClick={() => markRead(n.id)}
              className={`w-full flex items-start gap-3.5 px-5 py-4 text-left border-b last:border-0 hover:bg-muted/50 transition-colors ${!n.read ? 'bg-[rgba(0,165,223,0.05)]' : ''}`}
              data-testid="notification-row">
              <span className="mt-0.5 h-10 w-10 shrink-0 rounded-full grid place-items-center" style={{ background: `${n.color}1f` }}>
                {n.actor_avatar
                  ? <Avatar className="h-10 w-10"><AvatarImage src={n.actor_avatar} /><AvatarFallback>{n.actor_name?.[0]}</AvatarFallback></Avatar>
                  : <Icon className="h-5 w-5" style={{ color: n.color }} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{timeAgoEs(n.created_at)}</p>
              </div>
              {!n.read && <span className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: n.color }} />}
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
