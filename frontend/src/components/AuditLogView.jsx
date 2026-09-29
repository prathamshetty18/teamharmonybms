import React from 'react';
import { ShieldCheck, Clock, User, CheckCircle2, AlertTriangle, FileText, CloudRain } from 'lucide-react';

export default function AuditLogView({ logs = [] }) {
  const getActionBadge = (action) => {
    switch (action) {
      case 'CLAIM_SUBMITTED':
        return <span className="status-pill pending">CLAIM LODGED</span>;
      case 'GROUND_VERIFICATION_SUBMITTED':
        return <span className="status-pill ongoing">GROUND SURVEY</span>;
      case 'CLAIM_APPROVED_VERIFIED':
        return <span className="status-pill verified">TITLE VERIFIED ✓</span>;
      case 'CLAIM_DISPUTED':
        return <span className="status-pill disputed">DISPUTE FLAGGED ⚠️</span>;
      case 'DISPUTE_RESOLVED':
        return <span className="status-pill verified">DISPUTE RESOLVED</span>;
      case 'RELIEF_APPLICATION_SUBMITTED':
        return <span className="status-pill pending">RELIEF LODGED</span>;
      case 'RELIEF_APPLICATION_VERIFIED':
        return <span className="status-pill ongoing">RELIEF VERIFIED</span>;
      case 'RELIEF_APPLICATION_APPROVED':
        return <span className="status-pill verified">RELIEF APPROVED ✓</span>;
      case 'RELIEF_APPLICATION_REJECTED':
        return <span className="status-pill disputed">RELIEF REJECTED</span>;
      default:
        return <span className="black-badge" style={{ fontSize: '10px' }}>{action}</span>;
    }
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--brand-light)',
            color: 'var(--brand-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <h3 className="panel-title">Immutable Cadastral & Relief Audit Trail</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Cryptographically timestamped action logs for title adjudication and disaster sanctioning
            </span>
          </div>
        </div>
        <span className="black-badge" style={{ fontSize: '10px' }}>
          {logs.length} AUDIT RECORDS
        </span>
      </div>

      {logs.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px 20px', 
          background: '#F8FAFC', 
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--border-light)'
        }}>
          <Clock size={36} color="var(--text-placeholder)" style={{ margin: '0 auto 12px auto' }} />
          <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Audit Log is Empty</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
            No administrative or citizen actions have been executed in this session yet. Claim submissions, verifications, disputes, and relief sanctions will be recorded here in real-time.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="classification-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Target ID</th>
                <th>Actor</th>
                <th>Audit Details</th>
                <th>Tx Proof</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>
                      {log.displayTime || new Date(log.timestamp).toLocaleString('en-IN')}
                    </div>
                  </td>
                  <td>
                    {getActionBadge(log.action)}
                  </td>
                  <td>
                    <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {log.targetId}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>{log.actorName}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{log.actorRole}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '12px', color: 'var(--text-body)', maxWidth: '340px', lineHeight: '1.4' }}>
                      {log.details}
                    </div>
                  </td>
                  <td>
                    {log.txHash ? (
                      <a
                        href={log.explorerUrl || `https://testnet.mstscan.com/tx/${log.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Verify on MST Blockchain Explorer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#2563EB',
                          background: '#EFF6FF',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: '1px solid #BFDBFE',
                          textDecoration: 'none'
                        }}
                      >
                        🔗 {log.txHash.slice(0, 8)}...{log.txHash.slice(-6)} ↗
                      </a>
                    ) : (
                      <code style={{ 
                        fontFamily: 'var(--font-mono)', 
                        fontSize: '10px', 
                        background: '#F1F5F9', 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        color: 'var(--text-muted)'
                      }}>
                        On-Chain
                      </code>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
