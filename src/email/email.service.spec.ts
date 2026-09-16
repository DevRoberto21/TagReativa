import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

const sendTransacEmail = jest.fn();

jest.mock('@getbrevo/brevo', () => ({
  BrevoClient: jest.fn().mockImplementation(() => ({
    transactionalEmails: { sendTransacEmail },
  })),
}));

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns true when Brevo accepts the email', async () => {
    sendTransacEmail.mockResolvedValueOnce({});

    const result = await service.send(
      'owner@example.com',
      'Assunto',
      'Corpo da mensagem',
    );

    expect(result).toBe(true);
    expect(sendTransacEmail).toHaveBeenCalledTimes(1);
  });

  it('returns false when Brevo rejects the send', async () => {
    sendTransacEmail.mockRejectedValueOnce(new Error('Brevo API error'));

    const result = await service.send(
      'owner@example.com',
      'Assunto',
      'Corpo da mensagem',
    );

    expect(result).toBe(false);
  });
});
