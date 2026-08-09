import { useOctoprintStore } from '../../store/octoprintStore';
import { useLiveOctoStatus } from '../../hooks/useLiveOctoStatus';
import { useOctoMutations } from '../../hooks/useOctoMutations';
import { ConnectForm } from './ConnectForm';
import { StatusBadge } from './StatusBadge';
import { QueueList } from './QueueList';
import { ActivityLog } from './ActivityLog';
import { MiniProgressCanvas } from './MiniProgressCanvas';
import { GcodeDropZone } from './GcodeDropZone';

export function PrintPanel() {
  const connected = useOctoprintStore((s) => s.connected);
  const status = useLiveOctoStatus();
  const { disconnect, connectSerial, sendGrbl } = useOctoMutations();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {!connected ? (
          <ConnectForm />
        ) : (
          <>
            <StatusBadge status={status} onDisconnect={disconnect} onConnectSerial={connectSerial} onSendGrbl={sendGrbl} />
            {status.isPrinting && <MiniProgressCanvas status={status} />}
            <div className="border-t border-panel-border px-2.5 py-2.5">
              <QueueList />
            </div>
          </>
        )}
        <div className="border-t border-panel-border px-2.5 py-2">
          <ActivityLog />
        </div>
      </div>
      <div className="border-t border-panel-border px-2.5 py-2.5">
        <GcodeDropZone />
      </div>
    </div>
  );
}
