import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { DarkModeToggle, InlineError } from '../components/Common.jsx';
import { useDarkMode } from '../hooks/useDarkMode.js';
import { OrderHistory } from './OrderHistory.jsx';
import { RestaurantBrowser } from './RestaurantBrowser.jsx';
import { SavedAddresses } from './SavedAddresses.jsx';

export function CustomerDashboard({ token }) {
  const [dark, setDark] = useDarkMode();
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [orderRefresh, setOrderRefresh] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/v1/customers/me/addresses', { token }).then(rows => {
      const preferred = rows.find(a => a.is_default) || rows[0];
      if (preferred) setSelectedAddressId(preferred.id);
    }).catch(setError);
  }, [token]);

  return (
    <main className="shell" lang="te">
      <header className="topbar">
        <div><h1>పార్వతీపురం బైట్స్</h1><p>కస్టమర్ డ్యాష్‌బోర్డ్</p></div>
        <DarkModeToggle dark={dark} onChange={setDark} />
      </header>
      <InlineError error={error} />
      <SavedAddresses token={token} selectedId={selectedAddressId} onSelect={setSelectedAddressId} />
      <RestaurantBrowser token={token} selectedAddressId={selectedAddressId} onOrderPlaced={() => setOrderRefresh(x => x + 1)} />
      <OrderHistory token={token} defaultAddressId={selectedAddressId} refreshSignal={orderRefresh} />
    </main>
  );
}
