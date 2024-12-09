import 'module-alias/register';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { MongoClient } from 'mongodb';
import { SageUser } from '@lib/types/SageUser';
import { Course } from '@lib/types/Course';
import { BOT, DB, EMAIL, GUILDS, ROLES, FIRST_LEVEL } from '@root/config';

const MESSAGE = `<!DOCTYPE html>
<html>

<head>
	<title>Discord Verification</title>
</head>

<body>

	<h1 style="color:#00539F">Welcome!</h1>
	<p>You're getting this email because you're part of a class in the UD CIS Department that is using <span style="color:#738ADB">Discord</span> as its primary means of communication.</p>
	<p>For further information about the UD CIS <span style="color:#738ADB">Discord</span>, see <a href="https://ud-cis-discord.github.io/">this page.</a></p>
	<p><strong>If you don't have a <span style="color:#738ADB">Discord</span> account already, click <a href="https://discord.com/register">here</a> to sign up for one.</strong></p>
	<p>
		Once you are ready, click <a href="https://discord.gg/$invCode">here</a> to join the server and get yourself verified.
	<p>Once you're on the server, follow the instructions given to you in the channel called "getting-verified". Make sure you have your hash code (given below) ready!
	</p>

	<p>Further, usage of this Discord server means that you agree to <a href="https://docs.google.com/document/d/1ReVBzepnWvrt6bf4aRfaeHIDo4fFfEuNpOsjmGzvRdM/edit?usp=sharing">these rules</a>. 
	Please take a moment to review them.</p>

	<p>Your hash code is: <span style="color:blueviolet">$hash</span></p>
	<p><br>We hope to see you on the server soon!<br>- The <span style="color:#738ADB">Discord</span> Admin Team</p>

</body>

</html>
`;

const mailer = nodemailer.createTransport({
	host: 'mail.udel.edu',
	port: 25
});

async function main() {
	const client = await MongoClient.connect(DB.CONNECTION, { useUnifiedTopology: true });
	try {
		const db = client.db(BOT.NAME).collection(DB.USERS);
		const args = process.argv.slice(2);

		const { emails, isStaff, course } = await initializeEmailsAndCourse(args, client);

		logHeader();

		for (const email of emails) {
			if (email === '' || !isValidEmail(email)) {
				logInvalidEmail(email);
				continue;
			}

			const hash = generateHash(email);
			const entry: SageUser = await db.findOne({ email, hash });
			const newUser = createNewUser(email, hash, isStaff, course);

			if (await processExistingUser(entry, isStaff, newUser, db, email)) {
				continue;
			}

			await db.insertOne(newUser);
			logNewUser(email, isStaff, hash);

			sendEmail(email, hash);
			await sleep(1100);
		}
	} finally {
		client.close();
	}
}

function logHeader() {
	console.log(`${'email'.padEnd(18)} | ${'staff'.padEnd(5)} | hash
-------------------------------------------------------------------------`);
}

async function initializeEmailsAndCourse(args: string[], client: MongoClient) {
	let emails: string[] = [];
	let course: Course | undefined;
	let isStaff: boolean;

	if (args.length > 0) {
		({ emails, isStaff } = parseArgs(args));
	} else {
		({ emails, course } = await parseEmailFile(client));
		isStaff = determineStaffStatus(emails[0]);
	}

	emails.shift(); // Remove staff/student identifier
	return { emails, isStaff, course };
}

function parseArgs(args: string[]) {
	const isStaff = args[0].toLowerCase() === 'staff';
	const emails = isStaff ? args : ['STUDENT', ...args];
	return { emails, isStaff };
}

async function parseEmailFile(client: MongoClient) {
	const data = fs.readFileSync('./resources/emails.csv');
	const emails = data.toString().split('\n').map(email => email.trim());
	const [firstLine, courseId] = emails[0].split(',').map(str => str.trim());
	const course = await client.db(BOT.NAME).collection(DB.COURSES).findOne({ name: courseId });
	emails[0] = firstLine;
	return { emails, course };
}

function determineStaffStatus(firstEmail: string) {
	if (firstEmail.toLowerCase() === 'staff') return true;
	if (firstEmail.toLowerCase() === 'student') return false;
	console.error('First value must be STAFF or STUDENT');
	process.exit();
}

function isValidEmail(email: string): boolean {
	return email.endsWith('@udel.edu');
}

function logInvalidEmail(email: string) {
	if (email) console.error(`${email} is not a valid udel email.`);
}

function generateHash(email: string): string {
	return crypto.createHash('sha256').update(email).digest('base64').toString();
}

function createNewUser(email: string, hash: string, isStaff: boolean, course: Course | undefined): SageUser {
	const newUser: SageUser = {
		email,
		hash,
		isStaff,
		discordId: '',
		count: 0,
		levelExp: FIRST_LEVEL,
		curExp: FIRST_LEVEL,
		level: 1,
		levelPings: true,
		isVerified: false,
		pii: false,
		roles: [],
		courses: []
	};

	if (course) {
		if (isStaff) {
			newUser.roles.push(course.roles.staff);
		} else {
			newUser.roles.push(course.roles.student);
			newUser.courses.push(course.name);
		}
	}

	if (isStaff) newUser.roles.push(ROLES.STAFF);
	newUser.roles.push(ROLES.LEVEL_ONE);

	return newUser;
}

async function processExistingUser(entry: SageUser | null, isStaff: boolean, newUser: SageUser, db: any, email: string): Promise<boolean> {
	if (entry) { // User already onboarded
		if (isStaff && entry.isVerified) { // Staff is already verified
			await db.updateOne(entry, { $set: { isStaff: true } });
			console.log(`${email} was already in verified. Add staff roles manually. Discord ID ${entry.discordId}`);
		} else if (isStaff && !entry.isVerified) {
			await db.updateOne(entry, { $set: { ...newUser } });
		}
		return true;
	}
	return false;
}

function logNewUser(email: string, isStaff: boolean, hash: string) {
	console.log(`${email.padEnd(18)} | ${isStaff.toString().padEnd(5)} | ${hash}`);
}

async function sendEmail(email: string, hash: string): Promise<void> {
	mailer.sendMail({
		from: EMAIL.SENDER,
		replyTo: EMAIL.REPLY_TO,
		to: email,
		subject: 'Welcome to the UD CIS Discord!',
		html: MESSAGE.replace('$hash', hash).replace('$invCode', GUILDS.GATEWAY_INVITE)
	});
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
