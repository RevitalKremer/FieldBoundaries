import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';

const Step7: React.FC = () => {
    const navigate = useNavigate();

    const handleBack = () => {
        navigate('/step6');
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>
                Step 7
            </Typography>
            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button variant="contained" onClick={handleBack}>
                    Back
                </Button>
            </Box>
        </Box>
    );
};

export default Step7; 