import { Command } from '@lib/types/Command';
import { ROLES } from '@root/config';
import { BOTMASTER_PERMS } from '@lib/permissions';
import { ApplicationCommandPermissions, ChatInputCommandInteraction, InteractionResponse } from 'discord.js';

export default class extends Command {

	description = `Prunes all members who don't have the <@&${ROLES.VERIFIED}> role`;
	runInDM = false;
	permissions: ApplicationCommandPermissions[] = BOTMASTER_PERMS;

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		return interaction.reply('To be implemented again soon...');
	}

}

