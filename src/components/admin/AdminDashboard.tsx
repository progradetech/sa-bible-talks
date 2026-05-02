'use client';

import { useEffect, useState } from 'react';
import type { AdminRole, PrivateLeader } from '@/lib/types';
import { AdminHeader } from './AdminHeader';
import { AdminMap } from './AdminMap';
import { LeaderSidebar } from './LeaderSidebar';
import { LeaderDrawer } from './LeaderDrawer';
import { LeaderEditForm } from './LeaderEditForm';

type DrawerMode = 'view' | 'edit' | 'create' | null;

interface Props {
  leaders: PrivateLeader[];
  adminEmail: string;
  adminRole: AdminRole;
}

export function AdminDashboard({ leaders, adminEmail, adminRole }: Props) {
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);

  const selectedLeader =
    selectedLeaderId !== null
      ? (leaders.find((l) => l.id === selectedLeaderId) ?? null)
      : null;

  // If the selected leader is removed (e.g., deleted by another admin or
  // by us via a sibling tab) and is no longer in the leaders list, drop
  // the selection so the drawer doesn't render against stale state.
  useEffect(() => {
    if (selectedLeaderId !== null && selectedLeader === null && drawerMode !== 'create') {
      setSelectedLeaderId(null);
      setDrawerMode(null);
    }
  }, [selectedLeader, selectedLeaderId, drawerMode]);

  function handleSelectLeader(id: string | null) {
    setSelectedLeaderId(id);
    setDrawerMode(id ? 'view' : null);
  }

  function handleCreate() {
    setSelectedLeaderId(null);
    setDrawerMode('create');
  }

  function handleEdit() {
    setDrawerMode('edit');
  }

  function handleCancelEdit() {
    if (drawerMode === 'create') {
      setDrawerMode(null);
    } else {
      setDrawerMode('view');
    }
  }

  function handleSaved(id: string) {
    setSelectedLeaderId(id);
    setDrawerMode('view');
  }

  function handleDeleted() {
    setSelectedLeaderId(null);
    setDrawerMode(null);
  }

  function handleClose() {
    setSelectedLeaderId(null);
    setDrawerMode(null);
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={adminEmail} role={adminRole} currentPath="/admin" />

      <main className="relative flex-1 min-h-0">
        <AdminMap
          leaders={leaders}
          selectedLeaderId={selectedLeaderId}
          onSelect={handleSelectLeader}
        />
        <LeaderSidebar
          leaders={leaders}
          selectedLeaderId={selectedLeaderId}
          onSelect={handleSelectLeader}
          onCreate={handleCreate}
        />

        {drawerMode === 'view' && selectedLeader && (
          <LeaderDrawer
            leader={selectedLeader}
            onEdit={handleEdit}
            onClose={handleClose}
          />
        )}

        {drawerMode === 'edit' && selectedLeader && (
          <LeaderEditForm
            leader={selectedLeader}
            onCancel={handleCancelEdit}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}

        {drawerMode === 'create' && (
          <LeaderEditForm
            leader={null}
            onCancel={handleCancelEdit}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      </main>
    </div>
  );
}
