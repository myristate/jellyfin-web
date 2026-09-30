import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useState } from 'react';

import Loading from 'components/loading/LoadingComponent';
import Page from 'components/Page';
import globalize from 'lib/globalize';

/** A problem someone reported with a film or episode (Finly). */
type ItemReport = {
    Id: string;
    ItemId: string;
    ItemName: string;
    UserName: string;
    Problem: 'Video' | 'Audio' | 'WrongLanguage' | 'Subtitles' | 'Other';
    Note?: string | null;
    DateCreated: string;
    IsResolved: boolean;
    DateResolved?: string | null;
};

const PROBLEM_LABELS: Record<ItemReport['Problem'], string> = {
    Video: 'ReportProblemVideo',
    Audio: 'ReportProblemAudio',
    WrongLanguage: 'ReportProblemWrongLanguage',
    Subtitles: 'ReportProblemSubtitles',
    Other: 'ReportProblemOther'
};

const formatDate = (date: string) => new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

type ReportCardProps = {
    report: ItemReport;
    onChanged: () => void;
};

const ReportCard = ({ report, onChanged }: ReportCardProps) => {
    const onResolve = useCallback(() => {
        window.ApiClient.ajax({
            type: 'POST',
            url: window.ApiClient.getUrl(`ItemReports/${report.Id}/Resolve`, { resolved: !report.IsResolved })
        }).then(onChanged).catch(err => {
            console.error('[ItemReports] failed to update report', err);
        });
    }, [ report, onChanged ]);

    return (
        <Paper className='itemReport' sx={{ p: 2, opacity: report.IsResolved ? 0.6 : 1 }}>
            <Stack spacing={1}>
                <Stack direction='row' spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link href={`#/details?id=${report.ItemId}`} variant='h6' underline='hover'>{report.ItemName}</Link>
                    <Chip size='small' color={report.IsResolved ? 'default' : 'warning'} label={globalize.translate(PROBLEM_LABELS[report.Problem])} />
                </Stack>
                {report.Note && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{report.Note}</Typography>}
                <Typography variant='body2' color='text.secondary'>
                    {globalize.translate('ItemReportBy', report.UserName, formatDate(report.DateCreated))}
                    {report.IsResolved && report.DateResolved && ` · ${globalize.translate('ItemReportResolved', formatDate(report.DateResolved))}`}
                </Typography>
                <Box>
                    <Button className='btnResolveReport' variant={report.IsResolved ? 'text' : 'contained'} onClick={onResolve}>
                        {globalize.translate(report.IsResolved ? 'ButtonReopen' : 'ButtonMarkResolved')}
                    </Button>
                </Box>
            </Stack>
        </Paper>
    );
};

export const Component = () => {
    const [ reports, setReports ] = useState<ItemReport[]>();
    const [ showResolved, setShowResolved ] = useState(false);

    const load = useCallback(() => {
        window.ApiClient.getJSON(window.ApiClient.getUrl('ItemReports', { includeResolved: showResolved }))
            .then((loaded: ItemReport[]) => setReports(loaded))
            .catch(err => {
                console.error('[ItemReports] failed to load', err);
                setReports([]);
            });
    }, [ showResolved ]);

    useEffect(load, [ load ]);

    const onShowResolvedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setShowResolved(e.target.checked), []);

    if (!reports) return <Loading />;

    return (
        <Page
            id='itemReportsPage'
            title={globalize.translate('HeaderItemReports')}
            className='mainAnimatedPage type-interior'
        >
            <Box className='content-primary'>
                <Stack spacing={3}>
                    <Typography variant='h1'>{globalize.translate('HeaderItemReports')}</Typography>
                    <FormControlLabel
                        control={<Switch checked={showResolved} onChange={onShowResolvedChange} />}
                        label={globalize.translate('LabelShowResolved')}
                    />
                    {reports.length === 0 && <Alert severity='success'>{globalize.translate('ItemReportsNone')}</Alert>}
                    {reports.map(report => (
                        <ReportCard key={report.Id} report={report} onChanged={load} />
                    ))}
                </Stack>
            </Box>
        </Page>
    );
};

Component.displayName = 'ItemReportsPage';
