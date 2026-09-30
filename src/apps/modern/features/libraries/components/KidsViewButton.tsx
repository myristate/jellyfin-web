import ChildCare from '@mui/icons-material/ChildCare';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import React, { type FC, useCallback, useEffect, useState } from 'react';

import { chooseTarget, getTarget, KIDS_VIEW_CHANGED, start } from 'components/kidsView/kidsView';
import globalize from 'lib/globalize';

/**
 * Kids view (Finly): shows parents which films and shows a child's profile, or a level such as Child, can see.
 */
const KidsViewButton: FC = () => {
    const [ target, setTarget ] = useState(getTarget());

    useEffect(() => {
        const onChange = () => setTarget(getTarget());
        document.addEventListener(KIDS_VIEW_CHANGED, onChange);
        // Normally already started when the administrator signed in
        start().then(onChange).catch(() => {
            // the kids view logs its own failures
        });
        return () => document.removeEventListener(KIDS_VIEW_CHANGED, onChange);
    }, []);

    const onClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
        chooseTarget(e.currentTarget).catch(() => {
            // menu closed
        });
    }, []);

    const title = target ? `${globalize.translate('HeaderKidsView')}: ${target.name}` : globalize.translate('HeaderKidsView');

    return (
        <Tooltip title={title}>
            <Button
                className='btnKidsView'
                color={target ? 'primary' : 'inherit'}
                aria-label={title}
                onClick={onClick}
            >
                <ChildCare />
            </Button>
        </Tooltip>
    );
};

export default KidsViewButton;
