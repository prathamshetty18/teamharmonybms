import React from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export default function NotificationStack({ notifications, onDismiss }) {
  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="notification-stack">
      {notifications.map((notif) => {
        let icon = <Info size={18} color="#2563eb" />;
        let iconBg = "#eff6ff";

        if (notif.type === "warning") {
          icon = <AlertCircle size={18} color="#ea580c" />;
          iconBg = "#fff7ed";
        } else if (notif.type === "success") {
          icon = <CheckCircle size={18} color="#16a34a" />;
          iconBg = "#f0fdf4";
        }

        return (
          <div key={notif.id} className="notif-card">
            <div className="notif-icon-box" style={{ backgroundColor: iconBg }}>
              {icon}
            </div>
            <div className="notif-content">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="notif-title">{notif.title}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-placeholder)' }}>{notif.time}</span>
              </div>
              <p className="notif-body">{notif.body}</p>
              {notif.txHash && (
                <div style={{ marginTop: '6px' }}>
                  <a
                    href={notif.explorerUrl || `https://testnetscan.mstblockchain.com/tx/${notif.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: '#15803D',
                      fontWeight: 700,
                      textDecoration: 'underline'
                    }}
                  >
                    <span>🔗 View MST On-Chain Tx ({(notif.txHash).slice(0, 10)}...{(notif.txHash).slice(-6)}) ↗</span>
                  </a>
                </div>
              )}
            </div>
            <button className="notif-close" onClick={() => onDismiss(notif.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
