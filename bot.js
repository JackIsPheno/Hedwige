const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, SlashCommandBuilder, REST, Routes } = require('discord.js');
const net = require('net');

// Configuration
const config = {
    token: process.env.DISCORD_TOKEN,
    minecraftServer: {
        host: process.env.MC_SERVER_HOST || 'rp-semi.mine.fun',
        port: parseInt(process.env.MC_SERVER_PORT) || 25592,
        displayName: process.env.MC_DISPLAY_NAME || 'Château de Poudlard' // Nom à afficher
    },
    updateInterval: 15000, // 15 secondes - Temps réel !
    channelId: process.env.CHANNEL_ID,
    guildId: process.env.GUILD_ID // Ajoutez l'ID de votre serveur Discord
};

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages
    ] 
});

let statusMessage = null;
let lastStatus = null;
let playerCount = 0;

// Emojis et messages thématiques Harry Potter
const hogwartsEmojis = {
    online: '🟢',
    offline: '🔴', 
    castle: '🏰',
    wand: '🪄',
    wizard: '🧙‍♂️',
    witch: '🧙‍♀️',
    lightning: '⚡',
    owl: '🦉',
    potion: '🧪',
    book: '📚',
    star: '✨',
    crystal: '🔮'
};

const statusMessages = {
    online: [
        "Les portes de Poudlard sont ouvertes ! ✨",
        "Le château accueille de nouveaux sorciers ! 🏰",
        "La magie opère à Poudlard ! ⚡",
        "Les cours de magie ont commencé ! 🪄"
    ],
    offline: [
        "Poudlard est fermé pour la nuit... 🌙",
        "Le château dort sous la protection des sortilèges... 💤", 
        "Les fantômes gardent le château vide... 👻",
        "Les élèves sont partis en vacances... 🚂"
    ]
};

const houses = ['Noctilune', 'Rozlame', 'Clairvolle'];
const houseColors = {
    'Noctilune': 0x2C2C2C,     // Couleur sombre (gris très foncé)
    'Rozlame': 0xDC143C,      // Rouge vif  
    'Clairvolle': 0x1E90FF    // Bleu éclatant
};

// Fonction pour obtenir les vraies informations du serveur Minecraft
async function getMinecraftServerInfo(host, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);
        
        console.log(`🔮 Analyse magique approfondie de ${host}:${port}...`);
        
        const startTime = Date.now();
        
        // Construction du paquet de handshake Minecraft
        const createVarInt = (value) => {
            const result = [];
            while (value > 127) {
                result.push((value & 127) | 128);
                value >>>= 7;
            }
            result.push(value & 127);
            return Buffer.from(result);
        };
        
        const createString = (str) => {
            const strBuffer = Buffer.from(str, 'utf8');
            return Buffer.concat([createVarInt(strBuffer.length), strBuffer]);
        };
        
        // Paquet handshake
        const protocolVersion = createVarInt(760); // Version 1.19
        const serverAddress = createString(host);
        const serverPort = Buffer.allocUnsafe(2);
        serverPort.writeUInt16BE(port, 0);
        const nextState = createVarInt(1); // Status
        
        const handshakeData = Buffer.concat([
            createVarInt(0), // Packet ID
            protocolVersion,
            serverAddress,
            serverPort,
            nextState
        ]);
        
        const handshakePacket = Buffer.concat([
            createVarInt(handshakeData.length),
            handshakeData
        ]);
        
        // Paquet de demande de status
        const statusRequestData = createVarInt(0); // Packet ID
        const statusRequestPacket = Buffer.concat([
            createVarInt(statusRequestData.length),
            statusRequestData
        ]);
        
        let responseBuffer = Buffer.alloc(0);
        let expectingLength = true;
        let packetLength = 0;
        
        socket.on('connect', () => {
            console.log('🪄 Connexion établie, envoi du sortilège...');
            socket.write(handshakePacket);
            socket.write(statusRequestPacket);
        });
        
        socket.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]);
            
            try {
                if (expectingLength && responseBuffer.length > 0) {
                    // Lecture de la longueur du paquet (VarInt)
                    let length = 0;
                    let position = 0;
                    let currentByte;
                    
                    do {
                        if (position >= responseBuffer.length) return;
                        currentByte = responseBuffer[position];
                        length |= (currentByte & 0x7F) << (position * 7);
                        position++;
                    } while ((currentByte & 0x80) !== 0);
                    
                    packetLength = length;
                    responseBuffer = responseBuffer.slice(position);
                    expectingLength = false;
                }
                
                if (!expectingLength && responseBuffer.length >= packetLength) {
                    // Lecture du packet ID (devrait être 0)
                    let position = 0;
                    let packetId = 0;
                    let currentByte;
                    
                    do {
                        if (position >= responseBuffer.length) return;
                        currentByte = responseBuffer[position];
                        packetId |= (currentByte & 0x7F) << (position * 7);
                        position++;
                    } while ((currentByte & 0x80) !== 0);
                    
                    // Lecture de la longueur de la chaîne JSON
                    let jsonLength = 0;
                    currentByte;
                    
                    do {
                        if (position >= responseBuffer.length) return;
                        currentByte = responseBuffer[position];
                        jsonLength |= (currentByte & 0x7F) << ((position - 1) * 7);
                        position++;
                    } while ((currentByte & 0x80) !== 0);
                    
                    // Extraction du JSON
                    const jsonData = responseBuffer.slice(position, position + jsonLength);
                    const serverStatus = JSON.parse(jsonData.toString('utf8'));
                    
                    const ping = Date.now() - startTime;
                    console.log('✨ Informations magiques récupérées!', JSON.stringify(serverStatus.players || {}, null, 2));
                    
                    socket.destroy();
                    resolve({
                        online: true,
                        ping,
                        players: {
                            online: serverStatus.players?.online || 0,
                            max: serverStatus.players?.max || 100
                        },
                        version: serverStatus.version?.name || 'Inconnue',
                        description: serverStatus.description
                    });
                }
            } catch (error) {
                console.log('⚠️ Erreur de décodage magique:', error.message);
                // Fallback: juste vérifier si c'est en ligne
                const ping = Date.now() - startTime;
                socket.destroy();
                resolve({
                    online: true,
                    ping,
                    players: { online: 0, max: 100 }
                });
            }
        });
        
        socket.on('timeout', () => {
            console.log('🌙 Sortilège de détection échoué - timeout');
            socket.destroy();
            resolve({ online: false, error: 'Le château est inaccessible' });
        });
        
        socket.on('error', (err) => {
            console.log('⚠️ Magie défaillante:', err.message);
            socket.destroy();
            resolve({ online: false, error: 'Sortilège de protection activé' });
        });
        
        socket.connect(port, host);
    });
}

// Créer un embed magique
function createMagicalEmbed(serverInfo, displayName) {
    // ... reste du code {
    const randomHouse = houses[Math.floor(Math.random() * houses.length)];
    const houseColor = houseColors[randomHouse];
    
    const embed = new EmbedBuilder()
        .setTitle(`${hogwartsEmojis.castle} École de Magie Poudlard ${hogwartsEmojis.castle}`)
        .setTimestamp()
        .setFooter({ 
            text: `Dernière vérification magique • Maison du jour: ${randomHouse}`,
            iconURL: 'https://i.imgur.com/Q8VCQw2.png' // Logo Poudlard (vous pouvez changer)
        });
    
    if (serverInfo.online) {
        const randomMessage = statusMessages.online[Math.floor(Math.random() * statusMessages.online.length)];
        
        embed
            .setColor(0x4B0082) // Violet magique
            .setDescription(`${hogwartsEmojis.lightning} **${randomMessage}**\n\n${hogwartsEmojis.potion} **Serveur:** \`${displayName}\``)
            .addFields(
                { 
                    name: `${hogwartsEmojis.wizard} Sorciers en ligne`, 
                    value: `**${serverInfo.players?.online || 0}** / ${serverInfo.players?.max || 100}`,
                    inline: true 
                },
                { 
                    name: `${hogwartsEmojis.lightning} Latence magique`, 
                    value: `**${serverInfo.ping}ms**`,
                    inline: true 
                },
                { 
                    name: `${hogwartsEmojis.crystal} Statut`, 
                    value: `**OUVERT** ${hogwartsEmojis.star}`,
                    inline: true 
                }
            );
            
        // Ajout d'informations thématiques
        if (serverInfo.players?.online > 50) {
            embed.addFields({
                name: `${hogwartsEmojis.book} Info du château`,
                value: `${hogwartsEmojis.star} *Grande affluence ! Le château résonne de magie !*`
            });
        } else if (serverInfo.players?.online > 20) {
            embed.addFields({
                name: `${hogwartsEmojis.book} Info du château`, 
                value: `${hogwartsEmojis.owl} *Activité modérée dans les couloirs...*`
            });
        } else {
            embed.addFields({
                name: `${hogwartsEmojis.book} Info du château`,
                value: `${hogwartsEmojis.potion} *Ambiance intimiste, parfait pour explorer...*`
            });
        }
        
        embed.setThumbnail('https://i.imgur.com/8pTCkV1.png'); // Image Poudlard
        
    } else {
        const randomMessage = statusMessages.offline[Math.floor(Math.random() * statusMessages.offline.length)];
        
        embed
            .setColor(0x2C2C2C) // Gris sombre
            .setDescription(`${hogwartsEmojis.lightning} **${randomMessage}**\n\n${hogwartsEmojis.potion} **Serveur:** \`${displayName}\``)
            .addFields(
                { 
                    name: `${hogwartsEmojis.crystal} Statut`, 
                    value: `**FERMÉ** 🌙`,
                    inline: true 
                },
                { 
                    name: `🔒 Raison`, 
                    value: serverInfo.error || 'Sortilèges de protection',
                    inline: true 
                },
                { 
                    name: `${hogwartsEmojis.owl} Message`, 
                    value: `*Hibou-poste temporairement indisponible*`,
                    inline: false 
                }
            );
            
        embed.setThumbnail('https://i.imgur.com/N8tzbGN.png'); // Image château sombre
    }
    
    return embed;
}

// Mettre à jour le statut du bot de façon thématique
function updateBotStatus(serverInfo) {
    const playerCount = serverInfo.players?.online || 0;
    
    if (serverInfo.online) {
        const activities = [
            `✨ ${playerCount} sorciers à Poudlard`,
            `🏰 Château ouvert • ${playerCount} élèves`,
            `⚡ Magie active • ${playerCount} joueurs`,
            `🪄 Cours en session • ${playerCount} participants`
        ];
        
        const randomActivity = activities[Math.floor(Math.random() * activities.length)];
        client.user.setActivity(randomActivity, { type: ActivityType.Playing });
    } else {
        const offlineActivities = [
            '🌙 Poudlard dort...',
            '👻 Gardé par les fantômes',
            '🔒 Château protégé',
            '💤 Sortilèges de repos'
        ];
        
        const randomActivity = offlineActivities[Math.floor(Math.random() * offlineActivities.length)];
        client.user.setActivity(randomActivity, { type: ActivityType.Playing });
    }
}

// Fonction principale de mise à jour
async function updateServerStatus() {
    try {
        console.log('🔮 Invocation du sort de vérification...');
        
        const channel = client.channels.cache.get(config.channelId);
        if (!channel) {
            console.error('❌ Salle commune introuvable! ID:', config.channelId);
            return;
        }

        const serverInfo = await getMinecraftServerInfo(
            config.minecraftServer.host, 
            config.minecraftServer.port
        );
        
        const embed = createMagicalEmbed(
            serverInfo, 
            config.minecraftServer.host, 
            config.minecraftServer.port,
            config.minecraftServer.displayName
        );
        
        updateBotStatus(serverInfo);
        
        // Envoyer ou modifier le message
        if (!statusMessage) {
            statusMessage = await channel.send({ embeds: [embed] });
            console.log('📜 Parchemin de statut envoyé');
        } else {
            try {
                await statusMessage.edit({ embeds: [embed] });
                console.log('✏️ Parchemin mis à jour par magie');
            } catch (error) {
                statusMessage = await channel.send({ embeds: [embed] });
                console.log('📜 Nouveau parchemin créé');
            }
        }
        
        // Log uniquement si le statut a changé
        if (lastStatus !== serverInfo.online) {
            const statusText = serverInfo.online ? 'Poudlard ouvert ✨' : 'Poudlard fermé 🌙';
            console.log(`🏰 ${statusText}`);
            lastStatus = serverInfo.online;
        }
        
    } catch (error) {
        console.error('⚠️ Sortilège défaillant:', error.message);
    }
}

// Commandes slash thématiques
const commands = [
    new SlashCommandBuilder()
        .setName('poudlard')
        .setDescription('Vérifie l\'état magique du château de Poudlard'),
        
    new SlashCommandBuilder()
        .setName('maisons')
        .setDescription('Découvre les quatre maisons de Poudlard'),
        
    new SlashCommandBuilder()
        .setName('sortilege')
        .setDescription('Lance un sortilège aléatoire'),
        
    new SlashCommandBuilder()
        .setName('sorciers')
        .setDescription('Compte le nombre de sorciers dans le château')
];

// Gestion des commandes
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    try {
        switch (interaction.commandName) {
            case 'poudlard':
                await interaction.deferReply();
                const serverInfo = await getMinecraftServerInfo(config.minecraftServer.host, config.minecraftServer.port);
                const embed = createMagicalEmbed(serverInfo, config.minecraftServer.displayName);
                await interaction.editReply({ embeds: [embed] });
                break;
                
            case 'maisons':
                const housesEmbed = new EmbedBuilder()
                    .setTitle('🏰 Les Trois Maisons de Poudlard')
                    .setColor(0x4B0082)
                    .addFields(
                        { name: '🌙 Noctilune', value: 'Mystère, ténèbres et secrets anciens', inline: true },
                        { name: '⚔️ Rozlame', value: 'Courage, passion et détermination', inline: true },
                        { name: '💎 Clairvolle', value: 'Sagesse, clarté et intelligence', inline: true }
                    )
                    .setFooter({ text: 'Répartition par le Choixpeau Magique • Trois maisons légendaires' });
                await interaction.reply({ embeds: [housesEmbed] });
                break;
                
            case 'sortilege':
                const spells = [
                    '✨ *Lumos!* - Une lumière magique illumine les alentours',
                    '🪄 *Expelliarmus!* - L\'arme de l\'adversaire vole au loin', 
                    '⚡ *Expecto Patronum!* - Un patronus argenté apparaît',
                    '🔮 *Revelio!* - Les secrets cachés se révèlent',
                    '🧙‍♂️ *Protego!* - Un bouclier magique se forme',
                    '✨ *Pouciuss feat Krum* - Effacement de la réalité'
                ];
                const randomSpell = spells[Math.floor(Math.random() * spells.length)];
                await interaction.reply({ content: `🪄 **Sort lancé !**\n${randomSpell}`, ephemeral: true });
                break;
                
            case 'sorciers':
                const count = playerCount || Math.floor(Math.random() * 60) + 5;
                await interaction.reply({ 
                    content: `🧙‍♂️ **${count}** sorciers arpentent actuellement les couloirs de Poudlard ! ✨`,
                    ephemeral: true 
                });
                break;
        }
    } catch (error) {
        console.error('Erreur de sortilège:', error);
        await interaction.reply({ content: '⚠️ Sortilège raté ! Réessayez...', ephemeral: true });
    }
});

// Événements du bot
client.once('ready', async () => {
    console.log('🏰 Hedwige arrive à Poudlard:', client.user.tag);
    
    // Enregistrer les commandes
    try {
        console.log('📜 Inscription des sortilèges...');
        const rest = new REST().setToken(config.token);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands.map(command => command.toJSON()) }
        );
        console.log('✨ Sortilèges inscrits dans le grimoire !');
    } catch (error) {
        console.error('⚠️ Erreur d\'inscription des sortilèges:', error);
    }
    
    // Première vérification
    await updateServerStatus();
    
    // Mises à jour automatiques
    setInterval(updateServerStatus, config.updateInterval);
    console.log('⏰ Surveillance magique activée toutes les', config.updateInterval/1000, 'secondes');
});

// Gestionnaires d'erreurs
client.on('error', (error) => {
    console.error('⚠️ Problème de magie:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('🚫 Sortilège interrompu:', error);
});

// Message de démarrage
console.log('🦉 Hedwige prend son envol vers Poudlard...');
console.log('📍 Configuration magique:');
console.log('- 🏰 Château:', config.minecraftServer.host + ':' + config.minecraftServer.port);
console.log('- 📜 Parchemin ID:', config.channelId);
console.log('- 🔑 Clé magique:', config.token ? '✨ Présente' : '❌ Manquante');

// Démarrage du bot
client.login(config.token);