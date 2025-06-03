export default {
    hashtags: {
        '#haniiro': process.env.HANI_IRO_WEBHOOK,
        '#hanichobi': process.env.HANI_CHOBI_WEBHOOK,
        '#hanimuchu': process.env.HANI_MUCHU_WEBHOOK,
    },
    users: {
        'HaniHamuHima': process.env.HANI_TWITTER_WEBHOOK,
    },
    webhooks: {
        'HaniHamuHima': {
            id: 'HaniHamuHima',
            name: 'HaniHamuHima',
            url: process.env.HANI_TWITTER_WEBHOOK,
            enabled: true,
            timeGate: null,
        },
        '#haniiro': {
            id: '#haniiro',
            name: '#haniiro',
            url: process.env.HANI_IRO_WEBHOOK,
            enabled: true,
            timeGate: null,
        },
        '#hanichobi': {
            id: '#hanichobi',
            name: '#hanichobi',
            url: process.env.HANI_CHOBI_WEBHOOK,
            enabled: true,
            timeGate: null,
        },
        '#hanimuchu': {
            id: '#hanimuchu',
            name: '#hanimuchu',
            url: process.env.HANI_MUCHU_WEBHOOK,
            enabled: true,
            timeGate: null,
        },
    }
};
