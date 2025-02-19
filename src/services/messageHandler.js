import whatsappService from './whatsappService.js';
import appendToSheet
    from './googleSheetsService.js';
import openAiService from './openAiService.js';

class MessageHandler {
    constructor() {
        this.appointmentState = {}
        this.assistandState = {}
    }
    async handleIncomingMessage(message, senderInfo) {
        if (message?.type === 'text') {
            const incomingMessage = message.text.body.toLowerCase().trim()
            if (this.isGreeting(incomingMessage)) {
                await this.sendWelcomeMessage(message.from, message.id, senderInfo)
                await this.sendWelcomeMenu(message.from)
            } else if (incomingMessage === 'media') {
                await this.sendMedia(message.from)
            } else if (this.appointmentState[message.from]) {
                await this.handleAppointmentFlow(message.from, incomingMessage);
            } else if (this.assistandState[message.from]) {
                await this.handleAssistandFlow(message.from, incomingMessage);
            }
            else {
                await this.handleMenuOption(message.from, incomingMessage);

            }
            await whatsappService.markAsRead(message.id);
        } else if (message?.type === 'interactive') {
            const option = message?.interactive?.button_reply?.id
            console.log("acaaa")
            await this.handleMenuOption(message.from, option);
            await whatsappService.markAsRead
        }
    }

    isGreeting(message) {
        const greetings = ["hola", "hello", "hi", "buenas tardes", "buenos días", "buenas noches"]
        return greetings.includes(message)
    }

    getSenderName(senderInfo) {
        return senderInfo.profile?.name || senderInfo.wa_id;
    }

    async sendWelcomeMessage(to, messageId, senderInfo) {
        const name = this.getSenderName(senderInfo)
        const welcomeMessage = `Hola ${name}, Bienvenido a MEDPET, tu tienda de mascotas en línea. ¿En que puedo ayudarte hoy?`;
        await whatsappService.sendMessage(to, welcomeMessage, messageId)
    }

    async sendWelcomeMenu(to) {
        const menuMessage = "Elige una Opción:"
        const buttons = [
            {
                type: 'reply', reply: { id: 'option_1', title: 'Agendar' }
            },
            {
                type: 'reply', reply: { id: 'option_2', title: 'Consultar' }
            },
            {
                type: 'reply', reply: { id: 'option_3', title: 'Ubicación' }
            }
        ];

        await whatsappService.sendInteractiveButtons(to, menuMessage, buttons)
    }

    async handleMenuOption(to, option) {
        let response;
        console.log(option, "option")
        switch (option) {
            case 'option_1':
                this.appointmentState[to] = { step: 'name' }
                response = 'Por favor, ingresa tu nombre'
                break;
            case 'option_2':
                this.assistandState[to] = { step: 'question' };
                response = "Realiza tu consulta"
                break;
            case 'option_3':
                response = 'Te esperamos en nuestra Sucursal'
                await this.sendLocation(to)
                break;
            case 'option_6':
                response = 'Si esto es una emergencia, te invitamos a llamar a nuetsra línea de atención.'
                console.log("1111")
                await this.sendContact(to)
                break
            default:
                response = 'Lo siento, no entendí tu selección. Por favor, elige una de las opciones del menú'
                console.log("222")
        }
        await whatsappService.sendMessage(to, response);
    }

    async sendMedia(to) {

        // const mediaUrl = 'https://s3.amazonaws.com/gndx.dev/medpet-audio.aac';
        // const caption = 'Bienvenida';
        // const type = 'audio';

        // const mediaUrl = 'https://s3.amazonaws.com/gndx.dev/medpet-imagen.png';
        // const caption = '¡Esto es una Imagen!';
        // const type = 'image';

        const mediaUrl = 'https://s3.amazonaws.com/gndx.dev/medpet-video.mp4';
        const caption = '¡Esto es una video!';
        const type = 'video';

        // const mediaUrl = 'https://s3.amazonaws.com/gndx.dev/medpet-file.pdf';
        // const caption = '¡Esto es un PDF!';
        // const type = 'document';

        await whatsappService.sendMediaMessage(to, type, mediaUrl, caption)
    }

    completeAppointment(to) {
        console.log(to, "toooooooooo")
        const appointment = this.appointmentState[to];
        delete this.appointmentState[to];

        const userData = [
            to,
            appointment.name,
            appointment.petName,
            appointment.petType,
            appointment.reason,
            new Date().toISOString()
        ]

        appendToSheet(userData)
        return `Gracias por agendar tu cita.
        Resumen de tu cita:

        Nombre: ${appointment.name}
        Nombre de la Mascota: ${appointment.petName}
        Tipo de mascota: ${appointment.petType}
        Motivo: ${appointment.reason}

        Nos pondremos en contacto contigo pronto para confirmar la fecha y hora de tu cita.
        `
    }

    async handleAppointmentFlow(to, message) {
        const state = this.appointmentState[to];
        console.log(state, "stateeee")
        let response;

        switch (state.step) {
            case 'name':
                state.name = message;
                state.step = 'petName';
                response = 'Gracias. ¿Cuál es el nombre de tu mascota?'
                break;
            case 'petName':
                state.petName = message;
                state.step = 'petType';
                response = '¿Qué tipo de mascota es? (por ejemplo: perro, gato, etc)'
                break;
            case 'petType':
                state.petType = message;
                state.step = 'reason';
                response = '¿Cuàl es el motivo de tu consulta?'
                break;
            case 'reason':
                state.reason = message;
                response = this.completeAppointment(to);
                break;
            default:
                break;
        }
        await whatsappService.sendMessage(to, response)
    }

    async handleAssistandFlow(to, message) {
        const state = this.assistandState[to];
        let response;
        const menuMessage = "¿La respuesta fue de tu ayuda?"
        const buttons = [
            { type: 'reply', reply: { id: 'option_4', title: 'Si, gracias' } },
            { type: 'reply', reply: { id: 'option_5', title: 'Hacer otra pregunta' } },

            { type: 'reply', reply: { id: 'option_6', title: 'Emergencia' } },

        ]
        if (state.step === 'question') {
            response = await openAiService(message)
        }
        delete this.assistandState[to]
        await whatsappService.sendMessage(to, response);
        await whatsappService.sendInteractiveButtons(to, menuMessage, buttons)
    }

    async sendContact(to) {
        const contact = {
            addresses: [
                {
                    street: "123 Calle de las Mascotas",
                    city: "Ciudad",
                    state: "Estado",
                    zip: "12345",
                    country: "País",
                    country_code: "PA",
                    type: "WORK"
                }
            ],
            emails: [
                {
                    email: "contacto@medpet.com",
                    type: "WORK"
                }
            ],
            name: {
                formatted_name: "MedPet Contacto",
                first_name: "MedPet",
                last_name: "Contacto",
                middle_name: "",
                suffix: "",
                prefix: ""
            },
            org: {
                company: "MedPet",
                department: "Atención al Cliente",
                title: "Representante"
            },
            phones: [
                {
                    phone: "+1234567890",
                    wa_id: "1234567890",
                    type: "WORK"
                }
            ],
            urls: [
                {
                    url: "https://www.medpet.com",
                    type: "WORK"
                }
            ]
        };
        console.log("00022222")
        await whatsappService.sendContactMessage(to, contact);
    }
    async sendLocation(to) {
        const latitude = 6.2071694
        const longitude = -75.574607
        const name = 'Platzi Medellin'
        const address = 'Cra. 43A #5A - 113, El poblado, Medellin, Antioquía.'

        await whatsappService.sendLocationMessage(to, latitude, longitude, name, address)
    }

}

export default new MessageHandler();