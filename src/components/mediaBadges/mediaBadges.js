import escapeHtml from 'escape-html';

import './mediaBadges.scss';

const VIDEO_CODECS = {
    hevc: 'HEVC',
    h265: 'HEVC',
    h264: 'H.264',
    avc: 'H.264',
    av1: 'AV1',
    vp9: 'VP9',
    vp8: 'VP8',
    mpeg2video: 'MPEG-2',
    mpeg4: 'MPEG-4',
    vc1: 'VC-1',
    msmpeg4v3: 'DivX'
};

const AUDIO_CODECS = {
    truehd: 'TrueHD',
    eac3: 'Dolby Digital+',
    ac3: 'Dolby Digital',
    dts: 'DTS',
    aac: 'AAC',
    flac: 'FLAC',
    opus: 'Opus',
    vorbis: 'Vorbis',
    mp3: 'MP3',
    mp2: 'MP2',
    alac: 'ALAC'
};

/** Container names as people know them from the file extension. */
const CONTAINERS = {
    matroska: 'MKV',
    mkv: 'MKV',
    webm: 'WebM',
    mp4: 'MP4',
    m4v: 'MP4',
    mov: 'MOV',
    mpegts: 'TS',
    ts: 'TS',
    m2ts: 'M2TS',
    avi: 'AVI',
    asf: 'WMV',
    wmv: 'WMV',
    flv: 'FLV',
    ogg: 'OGG',
    mpeg: 'MPEG',
    mpg: 'MPEG',
    vob: 'VOB'
};

/**
 * The server can pass on ffmpeg's name for a family of formats, such as "mov,mp4,m4a,3gp,3g2,mj2" or
 * "matroska,webm", so pick the one the file most likely is rather than the first.
 */
function container(value) {
    const names = value.toLowerCase().split(',').map(name => name.trim()).filter(Boolean);
    if (names.includes('mp4')) return 'MP4';
    if (names.includes('matroska')) return 'MKV';
    const known = names.find(name => CONTAINERS[name]);
    return known ? CONTAINERS[known] : (names[0] || '').toUpperCase();
}

function resolution(stream) {
    const width = stream.Width || 0;
    const height = stream.Height || 0;
    if (width >= 3800 || height >= 2100) return '4K';
    if (width >= 2500 || height >= 1400) return '1440p';
    if (width >= 1900 || height >= 1000) return '1080p';
    if (width >= 1260 || height >= 700) return '720p';
    if (height > 0) return 'SD';
    return null;
}

function dolbyVision(stream) {
    if (!stream.DvProfile) return 'Dolby Vision';
    const compatibility = stream.DvBlSignalCompatibilityId ? `.${stream.DvBlSignalCompatibilityId}` : '';
    return `Dolby Vision P${stream.DvProfile}${compatibility}`;
}

/** The picture's dynamic range, as Dolby Vision (with its profile) and the HDR format it falls back to. */
function dynamicRange(stream) {
    switch (stream.VideoRangeType) {
        case 'DOVI':
            return [dolbyVision(stream)];
        case 'DOVIWithHDR10':
            return [dolbyVision(stream), 'HDR10'];
        case 'DOVIWithHDR10Plus':
            return [dolbyVision(stream), 'HDR10+'];
        case 'DOVIWithHLG':
            return [dolbyVision(stream), 'HLG'];
        case 'DOVIWithSDR':
            return [dolbyVision(stream)];
        case 'HDR10':
            return ['HDR10'];
        case 'HDR10Plus':
            return ['HDR10+'];
        case 'HLG':
            return ['HLG'];
        case 'SDR':
            return ['SDR'];
        default:
            return stream.VideoRange === 'HDR' ? ['HDR'] : [];
    }
}

function audioCodec(stream) {
    const codec = (stream.Codec || '').toLowerCase();
    const profile = stream.Profile || '';
    if (codec === 'dts') {
        if (/DTS:X/i.test(profile)) return 'DTS:X';
        if (/MA/.test(profile)) return 'DTS-HD MA';
        if (/HRA|HD/.test(profile)) return 'DTS-HD';
        return 'DTS';
    }
    if (codec.startsWith('pcm')) return 'PCM';
    return AUDIO_CODECS[codec] || codec.toUpperCase();
}

/** The usual layout for a number of channels, when the file doesn't name one. */
const CHANNEL_LAYOUTS = {
    1: 'Mono',
    2: 'Stereo',
    3: '2.1',
    4: '4.0',
    6: '5.1',
    8: '7.1'
};

function channels(stream) {
    if (stream.ChannelLayout) {
        // 5.1(side) is 5.1
        const layout = stream.ChannelLayout.split('(')[0];
        if (layout === 'stereo') return 'Stereo';
        if (layout === 'mono') return 'Mono';
        if (/^\d/.test(layout)) return layout;
    }
    if (!stream.Channels) return null;
    return CHANNEL_LAYOUTS[stream.Channels] || `${stream.Channels} ch`;
}

/**
 * The media details of a version of a film or episode (Finly): container, resolution, video codec, Dolby Vision
 * profile and HDR format, and the audio track's codec, Dolby Atmos and channels.
 * @param {object} mediaSource - The version.
 * @param {number} [audioIndex] - The audio track to describe, the version's default when left out.
 * @returns {{ text: string, dolby?: boolean }[]} The badges.
 */
export function getMediaBadges(mediaSource, audioIndex) {
    const badges = [];
    if (!mediaSource) return badges;
    const streams = mediaSource.MediaStreams || [];

    if (mediaSource.Container) {
        badges.push({ text: container(mediaSource.Container) });
    }

    const video = streams.find(s => s.Type === 'Video' && !s.IsExternal);
    if (video) {
        const res = resolution(video);
        if (res) badges.push({ text: res });
        const codec = VIDEO_CODECS[(video.Codec || '').toLowerCase()] || (video.Codec || '').toUpperCase();
        if (codec) badges.push({ text: codec });
        for (const range of dynamicRange(video)) {
            badges.push({ text: range, dolby: range.startsWith('Dolby') });
        }
    }

    const index = audioIndex ?? mediaSource.DefaultAudioStreamIndex;
    const audio = streams.find(s => s.Type === 'Audio' && s.Index === index)
        || streams.find(s => s.Type === 'Audio' && s.IsDefault)
        || streams.find(s => s.Type === 'Audio');
    if (audio) {
        badges.push({ text: audioCodec(audio) });
        if (/Atmos/i.test(audio.Profile || '') || /Atmos/i.test(audio.Title || '')) {
            badges.push({ text: 'Dolby Atmos', dolby: true });
        }
        const layout = channels(audio);
        if (layout) badges.push({ text: layout });
    }

    return badges.filter(b => b.text);
}

/** Fill an element with the media details badges, hiding it when there are none. */
export function renderMediaBadges(elem, mediaSource, audioIndex) {
    if (!elem) return;
    const badges = getMediaBadges(mediaSource, audioIndex);
    elem.innerHTML = badges
        .map(b => `<div class="mediaInfoItem mediaInfoText mediaBadge${b.dolby ? ' mediaBadge-dolby' : ''}">${escapeHtml(b.text)}</div>`)
        .join('');
    elem.classList.toggle('hide', badges.length === 0);
}
