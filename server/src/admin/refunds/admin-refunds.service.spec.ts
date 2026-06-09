import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminRefundsService } from './admin-refunds.service';
import { Refund, RefundStatus } from '../../entities/refund.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { CreditLedgerService } from '../../credit/creditledger.service';
import { AuditService } from '../../audit/audit.service';

describe('AdminRefundsService', () => {
  let service: AdminRefundsService;
  let refunds: { findOne: jest.Mock; save: jest.Mock };
  let orders: { findOne: jest.Mock; save: jest.Mock };
  let credits: { refund: jest.Mock };
  let audit: { write: jest.Mock };
  const operator = { id: 'admin-1', type: 'admin' } as any;

  beforeEach(async () => {
    refunds = { findOne: jest.fn(), save: jest.fn(async (r) => r) };
    orders = { findOne: jest.fn(), save: jest.fn(async (o) => o) };
    credits = { refund: jest.fn().mockResolvedValue({ balanceAfter: 0 }) };
    audit = { write: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminRefundsService,
        { provide: getRepositoryToken(Refund), useValue: refunds },
        { provide: getRepositoryToken(Order), useValue: orders },
        { provide: CreditLedgerService, useValue: credits },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminRefundsService);
  });

  describe('approve', () => {
    it('rejects when refund is missing', async () => {
      refunds.findOne.mockResolvedValue(null);
      await expect(service.approve('r-1', operator)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when refund is not PENDING', async () => {
      refunds.findOne.mockResolvedValue({ id: 'r-1', status: RefundStatus.APPROVED });
      await expect(service.approve('r-1', operator)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the order is not PAID', async () => {
      refunds.findOne.mockResolvedValue({
        id: 'r-1',
        status: RefundStatus.PENDING,
        orderId: 'o-1',
        userId: 'u-1',
      });
      orders.findOne.mockResolvedValue({ id: 'o-1', status: OrderStatus.PENDING });
      await expect(service.approve('r-1', operator)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('credits the user, marks order REFUNDED, writes audit log', async () => {
      refunds.findOne.mockResolvedValue({
        id: 'r-1',
        status: RefundStatus.PENDING,
        orderId: 'o-1',
        userId: 'u-1',
      });
      orders.findOne.mockResolvedValue({
        id: 'o-1',
        orderNo: 'ORD-1',
        status: OrderStatus.PAID,
        credits: 100,
      });
      const saved = await service.approve('r-1', operator);
      expect(credits.refund).toHaveBeenCalledWith('u-1', 100, 'r-1', expect.any(String));
      expect(saved.status).toBe(RefundStatus.APPROVED);
      expect(orders.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'o-1', status: OrderStatus.REFUNDED }),
      );
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'refund.approve' }),
      );
    });
  });

  describe('reject', () => {
    it('marks the refund REJECTED + writes audit with reason', async () => {
      refunds.findOne.mockResolvedValue({ id: 'r-1', status: RefundStatus.PENDING });
      await service.reject('r-1', operator, 'no evidence');
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'refund.reject',
          payload: { reason: 'no evidence' },
        }),
      );
    });
  });
});
