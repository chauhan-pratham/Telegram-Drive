import { BandwidthStats } from '../../../types';
import { formatBytes } from '../../../utils';

interface BandwidthWidgetProps {
    bandwidth: BandwidthStats | null;
}

export function BandwidthWidget({ bandwidth }: BandwidthWidgetProps) {
    if (!bandwidth) return null;

    const totalBytes = bandwidth.up_bytes + bandwidth.down_bytes;
    const limit = 250 * 1024 * 1024 * 1024; // 250GB
    const percent = Math.min((totalBytes / limit) * 100, 100);

    return (
        <div className="w-full px-4 space-y-1.5">
            <div className="w-full bg-telegram-border/40 rounded-full h-1 overflow-hidden">
                <div
                    className="bg-telegram-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${percent}%` }}
                ></div>
            </div>
            <div className="text-xs text-telegram-subtext/80 font-normal">
                {formatBytes(totalBytes)} of 250 GB daily limit
            </div>
        </div>
    );
}
