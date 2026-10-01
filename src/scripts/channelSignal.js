/**
 * (Finly) Tuner signal readings for live TV channels, from the Finly server's LiveTv/ChannelSignal endpoint.
 *
 * Older servers don't have the endpoint, so every failure resolves to "unknown" (an empty map or null) and is
 * only logged to the console. A channel without a reading shows nothing.
 */
import escapeHtml from 'escape-html';

import globalize from 'lib/globalize';

import 'styles/channelsignal.scss';

/** Channel ids may come with or without dashes depending on where they were read from. */
function normalizeId(id) {
    return String(id || '').replace(/-/g, '').toLowerCase();
}

function formatPercent(value) {
    return Number.isFinite(value) ? Math.round(value) : '?';
}

/**
 * Fetches the last known reading for every channel.
 * @returns {Promise<Map<string, object>>} Readings keyed by normalised channel id; empty if unavailable.
 */
export function getChannelSignals(apiClient) {
    return apiClient.getJSON(apiClient.getUrl('LiveTv/ChannelSignal')).then(function (result) {
        const signals = new Map();
        for (const [channelId, signal] of Object.entries(result?.Channels || {})) {
            if (signal) {
                signals.set(normalizeId(channelId), signal);
            }
        }
        return signals;
    }).catch(function (err) {
        console.warn('[Finly] Channel signal readings are not available', err);
        return new Map();
    });
}

/** Looks a channel up in the map returned by getChannelSignals. */
export function findChannelSignal(signals, channelId) {
    return signals?.get(normalizeId(channelId)) || null;
}

/**
 * Fetches one channel's reading; the server reads the tuner live when it's tuned to that channel.
 * @returns {Promise<object|null>} The reading, or null when it's unknown or the request failed.
 */
export function getChannelSignal(apiClient, channelId) {
    return apiClient.getJSON(apiClient.getUrl('LiveTv/ChannelSignal/' + encodeURIComponent(channelId))).catch(function (err) {
        console.debug('[Finly] No signal reading for channel ' + channelId, err);
        return null;
    });
}

/** "Signal 84% · Quality 100%" */
export function getSignalReadoutText(signal) {
    return globalize.translate('SignalReadout', formatPercent(signal.Strength), formatPercent(signal.Quality));
}

/** "Weak signal: quality 62%, strength 45%" */
export function getWeakSignalText(signal) {
    return globalize.translate('SignalWeakTooltip', formatPercent(signal.Quality), formatPercent(signal.Strength));
}

/** A small amber warning icon for a channel with a weak signal; empty for any other channel. */
export function getWeakSignalIconHtml(signal, cssClass) {
    if (!signal?.IsWeak) {
        return '';
    }

    const text = escapeHtml(getWeakSignalText(signal));
    return `<span class="material-icons signal_cellular_alt_1_bar channelSignalWeak ${cssClass || ''}" role="img" title="${text}" aria-label="${text}"></span>`;
}
