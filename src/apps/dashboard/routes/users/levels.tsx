import type { ParentalRating } from '@jellyfin/sdk/lib/generated-client/models/parental-rating';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import AddIcon from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useState } from 'react';

import {
    deleteProfileLevel,
    getProfileLevels,
    NO_LEVEL,
    saveProfileLevel,
    type ProfileLevel
} from 'apps/dashboard/features/users/api/profileLevels';
import confirm from 'components/confirm/confirm';
import Loading from 'components/loading/LoadingComponent';
import Page from 'components/Page';
import globalize from 'lib/globalize';

type RatingChoice = { name: string; score: number; subScore?: number | null };

// Ratings from every country that share a score are one choice, for example 12/12A/12+
const groupRatings = (ratings: ParentalRating[]): RatingChoice[] => {
    const choices: RatingChoice[] = [];
    for (const rating of ratings) {
        const score = rating.RatingScore?.score;
        if (score == null) continue;
        const subScore = rating.RatingScore?.subScore;
        const last = choices[choices.length - 1];
        if (last && last.score === score && last.subScore == subScore) {
            last.name += '/' + rating.Name;
        } else {
            choices.push({ name: rating.Name || String(score), score, subScore });
        }
    }
    return choices;
};

const splitTags = (text: string) => text.split(',').map(t => t.trim()).filter(t => t.length > 0);

type LevelEditorProps = {
    level: ProfileLevel;
    ratings: RatingChoice[];
    members: string[];
    onSaved: () => void;
    onCancelNew: () => void;
};

const LevelEditor = ({ level, ratings, members, onSaved, onCancelNew }: LevelEditorProps) => {
    const isNew = !level.Id;
    const [ name, setName ] = useState(level.Name);
    const [ rating, setRating ] = useState(() => {
        const index = ratings.findIndex(r => r.score === level.MaxParentalRating && r.subScore == level.MaxParentalSubRating);
        return index >= 0 ? String(index) : '';
    });
    const [ allowedTags, setAllowedTags ] = useState(level.AllowedTags.join(', '));
    const [ blockedTags, setBlockedTags ] = useState(level.BlockedTags.join(', '));
    const [ error, setError ] = useState<string>();

    const onNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value), []);
    const onRatingChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setRating(e.target.value), []);
    const onAllowedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setAllowedTags(e.target.value), []);
    const onBlockedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setBlockedTags(e.target.value), []);

    const onSave = useCallback(() => {
        const choice = rating === '' ? undefined : ratings[Number(rating)];
        saveProfileLevel(window.ApiClient, {
            ...level,
            Id: level.Id || NO_LEVEL,
            Name: name,
            MaxParentalRating: choice?.score ?? null,
            MaxParentalSubRating: choice?.subScore ?? null,
            AllowedTags: splitTags(allowedTags),
            BlockedTags: splitTags(blockedTags)
        }).then(() => {
            setError(undefined);
            onSaved();
        }).catch((response: Response) => {
            if (response?.status === 400 && typeof response.text === 'function') {
                response.text().then(setError, () => setError(globalize.translate('ErrorDefault')));
            } else {
                setError(globalize.translate('ErrorDefault'));
            }
        });
    }, [ level, name, rating, ratings, allowedTags, blockedTags, onSaved ]);

    const onDelete = useCallback(() => {
        if (isNew) {
            onCancelNew();
            return;
        }

        confirm(globalize.translate('ProfileLevelDeleteConfirm', level.Name), globalize.translate('Delete')).then(() => {
            deleteProfileLevel(window.ApiClient, level.Id).then(onSaved, () => setError(globalize.translate('ErrorDefault')));
        }).catch(() => {
            // confirm dialog closed
        });
    }, [ isNew, level, onSaved, onCancelNew ]);

    return (
        <Paper sx={{ p: 2 }}>
            <Stack spacing={2}>
                <TextField label={globalize.translate('LabelName')} value={name} onChange={onNameChange} required />
                <TextField
                    select
                    label={globalize.translate('LabelMaxParentalRating')}
                    value={rating}
                    onChange={onRatingChange}
                    helperText={globalize.translate('ProfileLevelRatingHelp')}
                    slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                >
                    <MenuItem value=''>{globalize.translate('ProfileLevelNoLimit')}</MenuItem>
                    {ratings.map((choice, index) => (
                        <MenuItem key={choice.name} value={String(index)}>{choice.name}</MenuItem>
                    ))}
                </TextField>
                <TextField
                    label={globalize.translate('LabelAllowContentWithTags')}
                    value={allowedTags}
                    onChange={onAllowedChange}
                    helperText={globalize.translate('ProfileLevelTagsHelp')}
                />
                <TextField
                    label={globalize.translate('LabelBlockContentWithTags')}
                    value={blockedTags}
                    onChange={onBlockedChange}
                    helperText={globalize.translate('ProfileLevelTagsHelp')}
                />
                {!isNew && (
                    <Typography variant='body2' color='text.secondary'>
                        {members.length ?
                            globalize.translate('ProfileLevelMembers', members.join(', ')) :
                            globalize.translate('ProfileLevelNoMembers')}
                    </Typography>
                )}
                {error && <Alert severity='error'>{error}</Alert>}
                <Stack direction='row' spacing={1}>
                    <Button variant='contained' onClick={onSave}>{globalize.translate('Save')}</Button>
                    <Button color='error' onClick={onDelete}>
                        {globalize.translate(isNew ? 'ButtonCancel' : 'Delete')}
                    </Button>
                </Stack>
            </Stack>
        </Paper>
    );
};

export const Component = () => {
    const [ levels, setLevels ] = useState<ProfileLevel[]>();
    const [ ratings, setRatings ] = useState<RatingChoice[]>([]);
    const [ users, setUsers ] = useState<UserDto[]>([]);
    const [ adding, setAdding ] = useState(false);

    const load = useCallback(() => {
        Promise.all([
            getProfileLevels(window.ApiClient),
            window.ApiClient.getParentalRatings(),
            window.ApiClient.getUsers()
        ]).then(([ loadedLevels, loadedRatings, loadedUsers ]) => {
            setRatings(groupRatings(loadedRatings));
            setUsers(loadedUsers);
            setLevels(loadedLevels);
            setAdding(false);
        }).catch(err => {
            console.error('[ProfileLevels] failed to load', err);
        });
    }, []);

    useEffect(load, [ load ]);

    const onAdd = useCallback(() => setAdding(true), []);
    const onCancelNew = useCallback(() => setAdding(false), []);

    if (!levels) return <Loading />;

    const membersOf = (level: ProfileLevel) => users
        .filter(u => (u.Policy as { ProfileLevelId?: string } | undefined)?.ProfileLevelId?.replace(/-/g, '') === level.Id.replace(/-/g, ''))
        .map(u => u.Name || '');

    return (
        <Page
            id='profileLevelsPage'
            title={globalize.translate('HeaderProfileLevels')}
            className='mainAnimatedPage type-interior'
        >
            <Box className='content-primary'>
                <Stack spacing={3}>
                    <Typography variant='h1'>{globalize.translate('HeaderProfileLevels')}</Typography>
                    <Typography>{globalize.translate('ProfileLevelsHelp')}</Typography>
                    {levels.map(level => (
                        <LevelEditor
                            key={level.Id}
                            level={level}
                            ratings={ratings}
                            members={membersOf(level)}
                            onSaved={load}
                            onCancelNew={onCancelNew}
                        />
                    ))}
                    {adding ? (
                        <LevelEditor
                            level={{ Id: '', Name: '', BlockUnratedItems: [], AllowedTags: [], BlockedTags: [] }}
                            ratings={ratings}
                            members={[]}
                            onSaved={load}
                            onCancelNew={onCancelNew}
                        />
                    ) : (
                        <Box>
                            <Button startIcon={<AddIcon />} onClick={onAdd}>{globalize.translate('ProfileLevelAdd')}</Button>
                        </Box>
                    )}
                </Stack>
            </Box>
        </Page>
    );
};

Component.displayName = 'ProfileLevelsPage';
